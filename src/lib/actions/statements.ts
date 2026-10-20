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
import { ensureWorkPaymentLink, isOwed, payFromLabel, workLineItem } from "@/lib/saleLinks";
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
// owed there (overdue ones ticked to start with), with a payment link for
// each work and one for them all, emailed with the statement attached as
// a PDF.

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
// exactly these, otherwise a new one (the old one closed and its Pay all
// link switched off) — with its payment links.
export async function makeStatement(customerId: string, purchaseIds: string[]): Promise<Result<{ statementId: string }>> {
  const gallery = await galleryArtist(customerId);
  if (!gallery.ok) return gallery;
  const chosen = new Set(purchaseIds);
  if (chosen.size === 0) return { ok: false, error: "Tick at least one work." };
  // Only works the gallery still owes for, in their usual order.
  const owed = (await owedGallerySales(customerId)).filter((s) => chosen.has(s.id));
  if (owed.length !== chosen.size) return { ok: false, error: "One of these works is no longer owed — please reopen Statement." };

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
    // Pay all only when every work payable by link shares one currency
    // and Stripe account.
    const payable = owed.filter((s) => !s.stripeSubscriptionScheduleId);
    const first = payable[0];
    const shared =
      first &&
      payable.every(
        (s) =>
          s.currency === first.currency &&
          s.stripeMode === first.stripeMode &&
          s.stripeAccountId === first.stripeAccountId
      );
    const statement = await db.statement.create({
      data: {
        artistId: gallery.artistId,
        customerId,
        ...(shared
          ? { currency: first.currency, stripeMode: first.stripeMode, stripeAccountId: first.stripeAccountId }
          : {}),
        lines: { create: owed.map((s, position) => ({ purchaseId: s.id, position })) },
      },
      select: { id: true },
    });
    statementId = statement.id;
  }

  // A failure to make links still opens the statement — they're made
  // again when its email is drafted.
  await ensureStatementLinks(statementId);
  return { ok: true, statementId };
}

// ---------- Payment links ----------

function statementLabelDate(statement: { createdAt: Date }): string {
  return statement.createdAt.toLocaleDateString("en-GB");
}

// The works on a statement payable by link now.
function payableSales(statement: LoadedStatement): StatementSale[] {
  return statement.lines.map((l) => l.purchase).filter(isOwed);
}

// Every link a statement's email offers: Pay all (when its works share a
// currency and Stripe account) and each work's own while there are two
// or more (one left is paid with Pay all). Made now if missing.
async function ensureStatementLinks(statementId: string): Promise<Result> {
  const statement = await loadStatement(statementId);
  if (!statement || statement.closedAt || statement.paidAt) return { ok: true };
  const payable = payableSales(statement);
  if (payable.length === 0) return { ok: true };
  try {
    const label = `${await payFromLabel(statement.artist)} · Statement ${statementLabelDate(statement)}`;

    if (statement.stripeMode && statement.currency && !statement.stripePaymentLinkUrl) {
      const lineItems = [];
      for (const sale of payable) lineItems.push(await workLineItem(sale, label));
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
    }

    const needWorkLinks = payable.length >= 2 || !statement.stripeMode;
    if (needWorkLinks) {
      for (const sale of payable) {
        const title = saleTitle(sale.artwork.catalogueName, sale.chargeKind);
        await ensureWorkPaymentLink(sale, label, `Statement ${statementLabelDate(statement)} · ${title}`);
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: stripeErrorMessage(err) };
  }
}

// A statement's Pay all, from Stripe's webhook: pays each listed work
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
// (StatementModal): each work still owed with its amount, invoice and
// payment link, then the link for them all.
export async function getStatementEmailDraft(statementId: string): Promise<StatementEmailDraft | { error: string }> {
  await ensureStatementLinks(statementId);
  const statement = await loadStatement(statementId);
  if (!statement) return { error: "Statement not found." };
  if (statement.closedAt) return { error: "A newer statement has replaced this one." };
  const recipient = recipientFor(statement);
  if (!recipient.ok) return { error: recipient.error };

  const owed = statement.lines.map((l) => l.purchase).filter((s) => s.status === "ACTIVE");
  const payable = owed.filter(isOwed);
  const payAll = statement.stripePaymentLinkUrl;
  const money = (s: StatementSale) => `${currencySymbol(s.currency)}${saleBreakdown(s).balance.toFixed(2)}`;
  const totals = owedTotals(statement)
    .map((t) => `${currencySymbol(t.currency)}${t.amount.toFixed(2)}`)
    .join(" + ");

  const workLines = owed.map((s) => {
    const invoiceNumber = liveInvoiceNumber(s);
    const where = invoiceNumber ? `invoice ${formatInvoiceNumber(invoiceNumber)}` : "not yet invoiced";
    const line = `- ${saleTitle(s.artwork.catalogueName, s.chargeKind)} (${where}, ${money(s)})`;
    if (s.stripeSubscriptionScheduleId) return `${line}: being paid by instalments`;
    // A single work left is paid with Pay all.
    const url = s.stripePaymentLinkUrl ?? (payable.length === 1 ? payAll : null);
    return url ? `${line}: ${url}` : line;
  });

  const body = [
    `Dear ${statementParty(statement.customer).firstName || "there"},`,
    "",
    `Please find attached our statement of works sold at ${statement.customer.name} and still to be paid for — ${owed.length} work${owed.length === 1 ? "" : "s"}, ${totals} in all.`,
    "",
    "Payment by transfer to our account on the statement, or by secure payment link — for each work as its buyer pays you, or all at once:",
    "",
    ...workLines,
    ...(payable.length > 1 && payAll ? ["", `- All ${payable.length} works: ${payAll}`] : []),
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
