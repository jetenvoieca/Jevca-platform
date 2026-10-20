"use server";

import { Resend } from "resend";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { saleBreakdown, saleTitle } from "@/lib/saleMath";
import { getStripeClientForSale } from "@/lib/stripe";
import { artistFromAddress } from "@/lib/email";
import { formatInvoiceNumber } from "@/lib/invoiceNumber";
import { currencySymbol } from "@/lib/pdfParts";
import { retireStatementPaymentLinks } from "@/lib/paymentLinks";
import { moveUnpaidSalesToCurrentStripeAccount } from "@/lib/invoices";
import { isOwed, payFromLabel, workLineItem } from "@/lib/saleLinks";
import { payBalancesInFull } from "@/lib/salePayments";
import {
  liveInvoiceNumber,
  loadStatement,
  owedGallerySales,
  statementParty,
  type LoadedStatement,
  type StatementSale,
} from "@/lib/statements";
import { generateStatementPdf } from "@/lib/statementPdf";
import { isSaleOverdue } from "@/lib/overdue";

// Statements (2026-10-20, direct request — galleries often pay only once
// their own buyer has paid them) — see Statement in schema.prisma. From a
// Gallery location's Statement button: the works chosen from those still
// owed there (overdue ones ticked to start with), with one payment link
// for the whole statement (2026-10-20, Craig after testing — not one per
// work), emailed with the statement attached as a PDF.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function stripeErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong talking to Stripe.";
}

// ---------- Choosing and making ----------

// One work a statement can list: a sale at the gallery still owed.
export type StatementChoice = {
  purchaseId: string;
  title: string;
  soldAt: string; // ISO
  invoiceNumber: string | null; // on an unpaid invoice now
  amount: string; // still owed
  currency: string;
  overdue: boolean;
};

// Is this a gallery location of a known artist? Its artist, or an error.
async function galleryArtist(customerId: string): Promise<Result<{ artistId: string; overdueDays: number }>> {
  const location = await db.location.findUnique({
    where: { customerId },
    select: { type: true, artistId: true, artist: { select: { invoiceOverdueDays: true } } },
  });
  if (!location || location.type !== "GALLERY") return { ok: false, error: "Statements are for gallery locations." };
  return { ok: true, artistId: location.artistId, overdueDays: location.artist.invoiceOverdueDays };
}

// The works a gallery's statement can list — every sale there still owed,
// oldest first, overdue ones marked (see lib/overdue.ts) — and which the
// gallery's current statement lists, to start the choice from.
export async function getStatementChoices(
  customerId: string
): Promise<Result<{ choices: StatementChoice[]; current: string[] }>> {
  const gallery = await galleryArtist(customerId);
  if (!gallery.ok) return gallery;
  const owed = await owedGallerySales(customerId);
  const current = await db.statement.findFirst({
    where: { customerId, closedAt: null, paidAt: null },
    select: { lines: { select: { purchaseId: true } } },
  });
  const ids = new Set(owed.map((s) => s.id));
  return {
    ok: true,
    choices: owed.map((s) => {
      const invoice = s.invoice && !s.invoice.paidAt && !s.invoice.cancelledAt ? s.invoice : null;
      return {
        purchaseId: s.id,
        title: saleTitle(s.artwork.catalogueName, s.chargeKind),
        soldAt: s.createdAt.toISOString(),
        invoiceNumber: invoice ? formatInvoiceNumber(invoice.number) : null,
        amount: saleBreakdown(s).balance.toFixed(2),
        currency: s.currency,
        overdue: isSaleOverdue(s, gallery.overdueDays),
      };
    }),
    current: (current?.lines ?? []).map((l) => l.purchaseId).filter((id) => ids.has(id)),
  };
}

// A statement of the chosen works — the gallery's current one if it lists
// exactly these, otherwise a new one (the old one closed and its link
// switched off) — with its payment link.
export async function makeStatement(customerId: string, purchaseIds: string[]): Promise<Result<{ statementId: string }>> {
  const gallery = await galleryArtist(customerId);
  if (!gallery.ok) return gallery;
  const chosen = new Set(purchaseIds);
  if (chosen.size === 0) return { ok: false, error: "Tick at least one work." };
  // Unpaid works still set to an older Stripe account move to the
  // artist's current one, so they can share the statement's link.
  await moveUnpaidSalesToCurrentStripeAccount([...chosen]);
  // Only works the gallery still owes for, in their usual order.
  const owed = (await owedGallerySales(customerId)).filter((s) => chosen.has(s.id));
  if (owed.length !== chosen.size) return { ok: false, error: "One of these works is no longer owed — please reopen Statement." };
  // One link pays the whole statement, so its works must share a currency
  // and Stripe account.
  const first = owed[0];
  const names = (list: typeof owed) => list.map((s) => `"${s.artwork.catalogueName}"`).join(", ");
  const otherCurrency = owed.filter((s) => s.currency !== first.currency);
  if (otherCurrency.length > 0) {
    return {
      ok: false,
      error: `${names(otherCurrency)} ${otherCurrency.length === 1 ? "is" : "are"} not in ${first.currency} like the other works — one statement is paid in one currency, so put ${otherCurrency.length === 1 ? "it" : "them"} on a statement of ${otherCurrency.length === 1 ? "its" : "their"} own.`,
    };
  }
  // Left on another account only if something was already paid on it
  // through Stripe there (see moveUnpaidSalesToCurrentStripeAccount).
  const otherAccount = owed.filter(
    (s) => s.stripeMode !== first.stripeMode || s.stripeAccountId !== first.stripeAccountId
  );
  if (otherAccount.length > 0) {
    return {
      ok: false,
      error: `${names(otherAccount)} already had a payment through a different Stripe account, so ${otherAccount.length === 1 ? "it needs" : "they need"} a statement of ${otherAccount.length === 1 ? "its" : "their"} own.`,
    };
  }

  const current = await db.statement.findFirst({
    where: { customerId, closedAt: null },
    include: { lines: { select: { purchaseId: true } } },
  });
  const same =
    current &&
    !current.paidAt &&
    current.lines.length === owed.length &&
    current.lines.every((l) => chosen.has(l.purchaseId));

  let statementId: string;
  if (same) {
    statementId = current.id;
  } else {
    if (current) {
      await retireStatementPaymentLinks({ id: current.id });
      await db.statement.update({ where: { id: current.id }, data: { closedAt: new Date() } });
    }
    const statement = await db.statement.create({
      data: {
        artistId: gallery.artistId,
        customerId,
        currency: first.currency,
        stripeMode: first.stripeMode,
        stripeAccountId: first.stripeAccountId,
        lines: { create: owed.map((s, position) => ({ purchaseId: s.id, position })) },
      },
      select: { id: true },
    });
    statementId = statement.id;
  }

  // A failure to make the link still opens the statement — it's made
  // again when its email is drafted.
  await ensureStatementLink(statementId);
  return { ok: true, statementId };
}

// ---------- Payment links ----------

function statementLabelDate(statement: { createdAt: Date }): string {
  return statement.createdAt.toLocaleDateString("en-GB");
}

// The statement's payment link, for everything on it still owed — made
// now if missing (and switched off whenever what a listed work owes
// changes; see retireSalePaymentLink).
async function ensureStatementLink(statementId: string): Promise<Result> {
  const statement = await loadStatement(statementId);
  if (!statement?.stripeMode || statement.closedAt || statement.paidAt || statement.stripePaymentLinkUrl) {
    return { ok: true };
  }
  const owed = statement.lines.map((l) => l.purchase).filter(isOwed);
  if (owed.length === 0) return { ok: true };
  try {
    const label = `${await payFromLabel(statement.artist)} · Statement ${statementLabelDate(statement)}`;
    const lineItems = [];
    for (const sale of owed) lineItems.push(await workLineItem(sale, label));
    const link = await getStripeClientForSale({
      stripeMode: statement.stripeMode,
      stripeAccountId: statement.stripeAccountId,
    }).paymentLinks.create({
      line_items: lineItems,
      custom_text: { submit: { message: label } },
      metadata: { statementId: statement.id },
      payment_intent_data: {
        description: `Statement ${statementLabelDate(statement)} · ${statement.customer.name}`,
        metadata: { statementId: statement.id },
      },
    });
    await db.statement.update({
      where: { id: statement.id },
      data: { stripePaymentLinkId: link.id, stripePaymentLinkUrl: link.url },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: stripeErrorMessage(err) };
  }
}

// A statement's payment link paid, from Stripe's webhook: pays each listed work
// still owed in full. Retrieved from the statement's own Stripe account,
// so a PaymentIntent from anywhere else isn't found; a repeat for the
// same PaymentIntent is ignored.
export async function recordStatementPaymentIntent(statementId: string, paymentIntentId: string) {
  const statement = await loadStatement(statementId);
  if (!statement?.stripeMode) return;
  const intent = await getStripeClientForSale({
    stripeMode: statement.stripeMode,
    stripeAccountId: statement.stripeAccountId,
  }).paymentIntents.retrieve(paymentIntentId);
  if (intent.status !== "succeeded" || intent.metadata?.statementId !== statementId) return;
  const sales = statement.lines.map((l) => l.purchase);
  if (sales.some((s) => s.payments.some((p) => p.stripePaymentIntentId === intent.id))) return;

  await payBalancesInFull(sales.filter(isOwed), { paidDate: new Date(), method: null, stripePaymentIntentId: intent.id });
  await db.statement.update({ where: { id: statement.id }, data: { paidAt: new Date() } });
}

// ---------- The statement window ----------

export type StatementWindowData = {
  id: string;
  galleryName: string;
  createdAt: string;
  emailedAt: string | null;
  emailedTo: string | null;
  paidAt: string | null;
  workCount: number;
  // What's owed, per currency.
  totals: { currency: string; amount: string }[];
};

function owedTotals(statement: LoadedStatement): { currency: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const { purchase } of statement.lines) {
    if (purchase.status !== "ACTIVE") continue;
    totals.set(purchase.currency, (totals.get(purchase.currency) ?? 0) + saleBreakdown(purchase).balance);
  }
  return [...totals].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }));
}

export async function getStatementWindow(statementId: string): Promise<StatementWindowData | null> {
  const statement = await loadStatement(statementId);
  if (!statement) return null;
  return {
    id: statement.id,
    galleryName: statement.customer.name,
    createdAt: statement.createdAt.toISOString(),
    emailedAt: statement.emailedAt?.toISOString() ?? null,
    emailedTo: statement.emailedTo,
    paidAt: statement.paidAt?.toISOString() ?? null,
    workCount: statement.lines.length,
    totals: owedTotals(statement).map((t) => ({ currency: t.currency, amount: t.amount.toFixed(2) })),
  };
}

// ---------- Email ----------

export type StatementEmailDraft = { to: string; subject: string; body: string };

function recipientFor(statement: LoadedStatement): { ok: true; to: string } | { ok: false; error: string } {
  const { email } = statementParty(statement.customer);
  if (!email) return { ok: false, error: "This gallery has no email address on file — add one on the Details tab first." };
  return { ok: true, to: email };
}

// The default subject and message — still editable before sending
// (StatementModal): each work still owed with its invoice and amount,
// then the one link to pay the whole statement.
export async function getStatementEmailDraft(statementId: string): Promise<StatementEmailDraft | { error: string }> {
  await ensureStatementLink(statementId);
  const statement = await loadStatement(statementId);
  if (!statement) return { error: "Statement not found." };
  if (statement.closedAt) return { error: "A newer statement has replaced this one." };
  const recipient = recipientFor(statement);
  if (!recipient.ok) return { error: recipient.error };

  const owed = statement.lines.map((l) => l.purchase).filter((s) => s.status === "ACTIVE");
  const payLink = statement.stripePaymentLinkUrl;
  const money = (s: StatementSale) => `${currencySymbol(s.currency)}${saleBreakdown(s).balance.toFixed(2)}`;
  const totals = owedTotals(statement)
    .map((t) => `${currencySymbol(t.currency)}${t.amount.toFixed(2)}`)
    .join(" + ");

  const workLines = owed.map((s) => {
    const invoiceNumber = liveInvoiceNumber(s);
    const where = invoiceNumber ? `invoice ${formatInvoiceNumber(invoiceNumber)}` : "not yet invoiced";
    return `- ${saleTitle(s.artwork.catalogueName, s.chargeKind)} (${where}): ${money(s)}`;
  });

  const body = [
    `Dear ${statementParty(statement.customer).firstName || "there"},`,
    "",
    `Please find attached our statement of works sold at ${statement.customer.name} and still to be paid for — ${owed.length} work${owed.length === 1 ? "" : "s"}, ${totals} in all.`,
    "",
    ...workLines,
    "",
    payLink
      ? `Payment by transfer to our account on the statement, or by this secure payment link for the whole statement: ${payLink}`
      : "Payment by transfer to our account on the statement.",
    "",
    "Many thanks,",
    statement.artist.name,
  ].join("\n");

  return {
    to: recipient.to,
    subject: `Statement — ${statement.customer.name} — ${statementLabelDate(statement)}`,
    body,
  };
}

// Sends it, with the statement PDF attached. The recipient is always
// worked out again here — never taken from the form.
export async function sendStatementEmail(statementId: string, formData: FormData): Promise<Result> {
  const statement = await loadStatement(statementId);
  if (!statement) return { ok: false, error: "Statement not found." };
  if (statement.closedAt) return { ok: false, error: "A newer statement has replaced this one." };
  const recipient = recipientFor(statement);
  if (!recipient.ok) return recipient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "Email sending isn't configured yet — RESEND_API_KEY is missing in Netlify." };
  const fromResult = artistFromAddress(statement.artist);
  if (!fromResult.ok) return { ok: false, error: fromResult.error };

  const subject = ((formData.get("subject") as string) || "").trim();
  const body = ((formData.get("body") as string) || "").trim();
  if (!subject || !body) return { ok: false, error: "Subject and message can't be empty." };

  let attachment: { filename: string; bytes: Uint8Array };
  try {
    attachment = await generateStatementPdf(statementId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not generate the statement." };
  }

  const { data, error } = await new Resend(apiKey).emails.send({
    from: fromResult.from,
    to: recipient.to,
    subject,
    text: body,
    attachments: [{ filename: attachment.filename, content: Buffer.from(attachment.bytes) }],
  });
  if (error) return { ok: false, error: error.message || "Resend could not send the email." };

  await db.statement.update({
    where: { id: statement.id },
    data: { emailedAt: new Date(), emailedTo: recipient.to },
  });
  await db.outboundEmail.create({
    data: {
      resendEmailId: data?.id || null,
      fromAddress: fromResult.address,
      toAddress: recipient.to,
      subject,
      body,
      kind: "STATEMENT",
      artistId: statement.artistId,
      customerId: statement.customerId,
    },
  });
  revalidatePath("/accounts/inbox");
  return { ok: true };
}
