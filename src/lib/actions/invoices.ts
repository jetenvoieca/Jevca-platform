"use server";

import { db } from "@/lib/db";
import { saleBreakdown, saleTitle } from "@/lib/saleMath";
import { getPublishableKey, getStripeClientForSale, toMinorUnits } from "@/lib/stripe";
import type { CardEntry } from "@/lib/actions/payments";
import { completeIfSettled, nextSequence, readPaidDetails } from "@/lib/salePayments";
import {
  buyerKey,
  invoiceBalance,
  invoiceExtras,
  loadInvoice,
  retireInvoicePaymentLink,
  type LoadedInvoice,
} from "@/lib/invoices";
import { formatInvoiceNumber } from "@/lib/invoiceNumber";
import { artworkDetailLines } from "@/lib/artworkDetails";
import { publicMediaUrl } from "@/lib/r2";

// Invoices (2026-10-14, Craig's mockups) — see Invoice in schema.prisma.
// Consigned sales are ticked on their Location's Sales tab and put on one
// invoice (Produce Invoice), or, once paid, on one receipt; a direct
// sale's invoice is an invoice of one (invoiceForSale). An unpaid invoice
// is paid in full — Take Card or Record Payment on one of its sales, or
// its payment link — or cancelled: kept on record, its sales freed.
// While unpaid, its sales can't be changed or paid on their own
// (invoiceLockError, lib/invoices.ts).

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function stripeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Something went wrong talking to Stripe.";
}

// A cost typed when producing an invoice: blank = none.
function readCost(raw: string | undefined, label: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const text = (raw ?? "").trim();
  if (!text) return { ok: true, value: null };
  const n = parseFloat(text);
  if (Number.isNaN(n) || n < 0) return { ok: false, error: `That ${label} cost isn't valid.` };
  return { ok: true, value: n > 0 ? n.toFixed(2) : null };
}

// ---------- Producing ----------

// "Produce Invoice" on a location's Sales tab: one invoice for every
// ticked sale. They must be consigned sales of the same location and
// buyer, in the same currency and Stripe account, not framing/delivery
// charge sales (older ones, invoiced on their own), and not already on
// an invoice — and either all unpaid (not being paid by instalments), or
// all already paid (then it's their receipt, already marked paid).
//
// An unpaid invoice at an Own location can carry framing and delivery
// costs for the whole invoice (`costs`, 2026-10-14 — a gallery arranges
// its own). It gets the next number, today's date, and a payment link for
// the whole balance so the emailed invoice always includes a way to pay
// (if Stripe can't make one, the invoice is still produced and the link
// is made when the email is drafted).
export async function produceInvoice(
  purchaseIds: string[],
  costs?: { framing?: string; delivery?: string }
): Promise<Result<{ invoiceId: string }>> {
  const ids = [...new Set(purchaseIds)];
  if (ids.length === 0) return { ok: false, error: "Tick at least one sale." };

  const sales = await db.purchase.findMany({
    where: { id: { in: ids } },
    include: { artwork: { select: { artistId: true } }, customer: { select: { kind: true } }, payments: true },
    relationLoadStrategy: "query",
  });
  if (sales.length !== ids.length) return { ok: false, error: "One of these sales no longer exists." };

  const paid = sales[0].status === "COMPLETED";
  for (const sale of sales) {
    if (sale.channel !== "GALLERY") return { ok: false, error: "Only consigned sales can share an invoice." };
    if (sale.status === "ABANDONED") return { ok: false, error: "One of these sales was cancelled." };
    if ((sale.status === "COMPLETED") !== paid) {
      return { ok: false, error: "Paid and unpaid sales can't share an invoice." };
    }
    if (sale.chargeKind && ids.length > 1) {
      return { ok: false, error: "Framing and delivery charges are invoiced on their own." };
    }
    if (sale.invoiceId) return { ok: false, error: "One of these sales is already on an invoice." };
    if (paid) continue;
    if (sale.stripeSubscriptionScheduleId) {
      return { ok: false, error: "One of these sales is being paid by instalments through Stripe." };
    }
    if (saleBreakdown(sale).balance <= 0) return { ok: false, error: "Nothing is left to pay on one of these sales." };
  }

  const first = sales[0];
  const mismatch = sales.find(
    (s) =>
      s.artwork.artistId !== first.artwork.artistId ||
      buyerKey(s) !== buyerKey(first) ||
      s.currency !== first.currency ||
      s.stripeMode !== first.stripeMode ||
      s.stripeAccountId !== first.stripeAccountId
  );
  if (mismatch) {
    if (mismatch.currency !== first.currency) return { ok: false, error: "The sales on one invoice must all be in the same currency." };
    if (buyerKey(mismatch) !== buyerKey(first)) return { ok: false, error: "These sales are to different buyers." };
    return { ok: false, error: "These sales were taken into different Stripe accounts, so they can't share a payment link." };
  }

  const framing = readCost(costs?.framing, "framing");
  if (!framing.ok) return framing;
  const delivery = readCost(costs?.delivery, "delivery");
  if (!delivery.ok) return delivery;
  if ((framing.value || delivery.value) && (paid || first.customer?.kind === "GALLERY")) {
    return { ok: false, error: "Framing and delivery are only added to an Own location's invoice." };
  }

  // Ordered as ticked, which is the table's order.
  const ordered = ids.map((id) => sales.find((s) => s.id === id)!);
  // A receipt is dated the day the last of its sales was paid.
  const lastPaid = ordered.reduce<Date | null>(
    (latest, s) => (s.closedAt && (!latest || s.closedAt > latest) ? s.closedAt : latest),
    null
  );
  const created = await createInvoice(ordered, {
    paidAt: paid ? (lastPaid ?? new Date()) : null,
    framingCost: framing.value,
    deliveryCost: delivery.value,
  });
  if (!created.ok || paid) return created;

  await createInvoicePaymentLink(created.invoiceId);
  return created;
}

// The invoice to open for a direct sale ("Send invoice", a past sale's
// Invoice/Receipt): its current invoice, or else a new invoice of one —
// for a paid sale, already marked paid, so it's its receipt. A cancelled
// sale gets no new invoice.
export async function invoiceForSale(purchaseId: string): Promise<Result<{ invoiceId: string }>> {
  const sale = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: { artwork: { select: { artistId: true } } },
  });
  if (!sale) return { ok: false, error: "Sale not found." };
  if (sale.invoiceId) return { ok: true, invoiceId: sale.invoiceId };
  if (sale.status === "ABANDONED") return { ok: false, error: "This sale was cancelled." };

  const isPaid = sale.status === "COMPLETED";
  return createInvoice([sale], { paidAt: isPaid ? (sale.closedAt ?? new Date()) : null });
}

// Creates the invoice with the artist's next number, and puts the sales
// on it, in one transaction: if another invoice claimed one of them in
// the meantime, nothing is created.
async function createInvoice(
  sales: {
    id: string;
    currency: string;
    stripeMode: "TEST" | "LIVE";
    stripeAccountId: string | null;
    artwork: { artistId: string };
  }[],
  details: { paidAt: Date | null; framingCost?: string | null; deliveryCost?: string | null }
): Promise<Result<{ invoiceId: string }>> {
  const first = sales[0];
  try {
    const invoiceId = await db.$transaction(async (tx) => {
      const artist = await tx.artist.update({
        where: { id: first.artwork.artistId },
        data: { nextInvoiceNumber: { increment: 1 } },
        select: { nextInvoiceNumber: true },
      });
      const invoice = await tx.invoice.create({
        data: {
          artistId: first.artwork.artistId,
          number: artist.nextInvoiceNumber - 1,
          currency: first.currency,
          stripeMode: first.stripeMode,
          stripeAccountId: first.stripeAccountId,
          paidAt: details.paidAt,
          framingCost: details.framingCost ?? null,
          deliveryCost: details.deliveryCost ?? null,
          lines: { create: sales.map((s, position) => ({ purchaseId: s.id, position })) },
        },
      });
      const claimed = await tx.purchase.updateMany({
        where: { id: { in: sales.map((s) => s.id) }, invoiceId: null },
        data: { invoiceId: invoice.id },
      });
      if (claimed.count !== sales.length) throw new Error("ALREADY_INVOICED");
      return invoice.id;
    });
    return { ok: true, invoiceId };
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_INVOICED") {
      return { ok: false, error: "One of these sales is already on an invoice." };
    }
    throw err;
  }
}

// ---------- The invoice window ----------

export type InvoiceWindowData = {
  id: string;
  number: string;
  status: "UNPAID" | "PAID" | "CANCELLED";
  createdAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  emailedAt: string | null;
  emailedTo: string | null;
  receiptEmailedAt: string | null;
  receiptEmailedTo: string | null;
  balance: string;
  currency: string;
  // Being paid by instalments through Stripe.
  onInstalments: boolean;
  sales: { id: string; title: string }[];
};

function invoiceStatus(invoice: { paidAt: Date | null; cancelledAt: Date | null }) {
  return invoice.cancelledAt ? "CANCELLED" : invoice.paidAt ? "PAID" : "UNPAID";
}

export async function getInvoiceWindow(invoiceId: string): Promise<InvoiceWindowData | null> {
  const invoice = await loadInvoice(invoiceId);
  if (!invoice) return null;
  const sales = invoice.lines.map((l) => l.purchase);
  return {
    id: invoice.id,
    number: formatInvoiceNumber(invoice.number),
    status: invoiceStatus(invoice),
    createdAt: invoice.createdAt.toISOString(),
    paidAt: invoice.paidAt?.toISOString() ?? null,
    cancelledAt: invoice.cancelledAt?.toISOString() ?? null,
    emailedAt: invoice.emailedAt?.toISOString() ?? null,
    emailedTo: invoice.emailedTo,
    receiptEmailedAt: invoice.receiptEmailedAt?.toISOString() ?? null,
    receiptEmailedTo: invoice.receiptEmailedTo,
    balance: invoiceBalance(invoice).toFixed(2),
    currency: invoice.currency,
    onInstalments: sales.some((s) => s.stripeSubscriptionScheduleId),
    sales: sales.map((s) => ({ id: s.id, title: saleTitle(s.artwork.catalogueName, s.chargeKind) })),
  };
}

// Why an invoice can't be paid or linked right now.
function notOpenError(invoice: LoadedInvoice): string | null {
  if (invoice.cancelledAt) return "This invoice was cancelled.";
  if (invoice.paidAt) return "This invoice has already been paid.";
  if (!invoice.lines.every((l) => l.purchase.channel === "GALLERY")) {
    return "A direct sale's invoice is paid from the sale itself.";
  }
  if (invoice.lines.some((l) => l.purchase.stripeSubscriptionScheduleId)) {
    return "This invoice is being paid by instalments through Stripe.";
  }
  return null;
}

// ---------- Paying ----------

// The invoice's payment link — a persistent Stripe Payment Link (not a
// Checkout Session, which expires within a day) for the whole balance:
// one line per work (name, picture, details), plus its framing and
// delivery, with who it's from and the invoice number by the Pay button. Made once and
// reused; switched off when the invoice is paid or cancelled. invoiceId
// rides on the PaymentIntent's own metadata (Payment Link metadata
// doesn't reach it) — that's how the webhook recognises the payment
// (recordInvoicePaymentIntent).
export async function createInvoicePaymentLink(invoiceId: string): Promise<Result<{ url: string }>> {
  try {
    const invoice = await loadInvoice(invoiceId);
    if (!invoice) return { ok: false, error: "Invoice not found." };
    const closed = notOpenError(invoice);
    if (closed) return { ok: false, error: closed };
    if (invoice.stripePaymentLinkUrl) return { ok: true, url: invoice.stripePaymentLinkUrl };

    const stripe = getStripeClientForSale(invoice);
    const money = (n: number) =>
      new Intl.NumberFormat("en-GB", { style: "currency", currency: invoice.currency }).format(n);

    // Each work as its own product (2026-10-14, Craig: the payment page
    // must show what's being paid for) — its name, picture and details
    // (type, size, medium, and how the amount was reached), then the
    // invoice's framing and delivery. Stripe lists them with the total.
    // Who it's from and the invoice number — at the start of each work's
    // details (seen under the page's "View details") and by the Pay
    // button. The page's own heading is the Stripe account's name, which
    // can't be set per invoice.
    const site = await db.site.findFirst({
      where: { artistId: invoice.artistId, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "asc" },
      select: { name: true },
    });
    const from = [invoice.artist.name, site?.name].filter(Boolean).join(" – ");
    const invoiceLabel = `${from} · Invoice ${formatInvoiceNumber(invoice.number)}`;

    const lineItems: { price: string; quantity: number }[] = [];
    for (const { purchase } of invoice.lines) {
      const b = saleBreakdown(purchase);
      if (b.balance <= 0) continue;
      const deductions = [
        b.commission ? `less ${b.commissionPercent}% commission` : null,
        b.deposit ? `less ${money(b.deposit)} deposit paid` : null,
        b.paid ? `less ${money(b.paid)} already paid` : null,
      ].filter(Boolean);
      const description = [
        invoiceLabel,
        artworkDetailLines(purchase.artwork).join(" · "),
        deductions.length ? `Sale price ${money(b.salePrice)}, ${deductions.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(" — ");
      const imageKey = purchase.artwork.mainImage?.displayKey ?? purchase.artwork.images[0]?.displayKey;
      const imageUrl = publicMediaUrl(imageKey);
      const product = await stripe.products.create({
        name: saleTitle(purchase.artwork.catalogueName, purchase.chargeKind),
        ...(description ? { description } : {}),
        ...(imageUrl?.startsWith("https://") ? { images: [imageUrl] } : {}),
      });
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: toMinorUnits(b.balance),
        currency: invoice.currency.toLowerCase(),
      });
      lineItems.push({ price: price.id, quantity: 1 });
    }
    const extras = invoiceExtras(invoice);
    if (extras.balance > 0) {
      for (const [name, amount] of [
        ["Framing", extras.framing],
        ["Delivery", extras.delivery],
      ] as const) {
        if (!amount) continue;
        const price = await stripe.prices.create({
          unit_amount: toMinorUnits(amount),
          currency: invoice.currency.toLowerCase(),
          product_data: { name },
        });
        lineItems.push({ price: price.id, quantity: 1 });
      }
    }
    if (lineItems.length === 0) return { ok: false, error: "Nothing is left to pay on this invoice." };

    const link = await stripe.paymentLinks.create({
      line_items: lineItems,
      custom_text: {
        submit: { message: invoiceLabel },
      },
      metadata: { invoiceId: invoice.id },
      payment_intent_data: {
        description: `Invoice ${formatInvoiceNumber(invoice.number)}`,
        metadata: { invoiceId: invoice.id },
      },
    });
    await db.invoice.update({
      where: { id: invoice.id },
      data: { stripePaymentLinkId: link.id, stripePaymentLinkUrl: link.url },
    });
    return { ok: true, url: link.url };
  } catch (err) {
    return { ok: false, error: stripeErrorMessage(err) };
  }
}

// "Take Card" on a sale that's on an unpaid invoice: the whole invoice is
// paid by card, entered in the app by the artist with Stripe's own card
// form (StripeCardForm), into the invoice's Stripe account. invoiceId
// rides on the PaymentIntent's metadata, so the card form and the webhook
// both record it with recordInvoicePaymentIntent.
export async function createInvoiceCardIntent(invoiceId: string): Promise<Result<CardEntry>> {
  try {
    const invoice = await loadInvoice(invoiceId);
    if (!invoice) return { ok: false, error: "Invoice not found." };
    const closed = notOpenError(invoice);
    if (closed) return { ok: false, error: closed };
    const balance = invoiceBalance(invoice);
    if (balance <= 0) return { ok: false, error: "Nothing is left to pay on this invoice." };

    const intent = await getStripeClientForSale(invoice).paymentIntents.create({
      amount: toMinorUnits(balance),
      currency: invoice.currency.toLowerCase(),
      description: `Invoice ${formatInvoiceNumber(invoice.number)}`,
      metadata: { invoiceId: invoice.id },
    });
    if (!intent.client_secret) return { ok: false, error: "Stripe did not return a client secret." };
    return {
      ok: true,
      clientSecret: intent.client_secret,
      publishableKey: getPublishableKey(invoice.stripeMode),
      stripeAccount: invoice.stripeAccountId,
    };
  } catch (err) {
    return { ok: false, error: stripeErrorMessage(err) };
  }
}

// Records the whole invoice as paid: each sale's balance as its own PAID
// payment, and its framing and delivery as the invoice's own — then
// completes the sales, which marks the invoice paid (settleInvoiceIfPaid,
// lib/invoices.ts). Shared by Record Payment and card / link payments.
async function payInvoice(
  invoice: LoadedInvoice,
  payment: { paidDate: Date; method: string | null; stripePaymentIntentId?: string }
) {
  const paidFields = {
    status: "PAID" as const,
    paidDate: payment.paidDate,
    method: payment.method,
    stripePaymentIntentId: payment.stripePaymentIntentId ?? null,
  };
  const sales = invoice.lines.map((l) => l.purchase).filter((s) => s.invoiceId === invoice.id);
  const extras = invoiceExtras(invoice);

  await db.$transaction([
    ...sales
      .map((sale) => ({ sale, balance: saleBreakdown(sale).balance }))
      .filter(({ balance }) => balance > 0)
      .map(({ sale, balance }) =>
        db.payment.create({
          data: {
            ...paidFields,
            purchaseId: sale.id,
            sequence: nextSequence(sale.payments),
            amount: balance.toFixed(2),
            currency: sale.currency,
          },
        })
      ),
    ...(extras.balance > 0
      ? [
          db.payment.create({
            data: {
              ...paidFields,
              invoiceId: invoice.id,
              sequence: nextSequence(invoice.payments),
              amount: extras.balance.toFixed(2),
              currency: invoice.currency,
            },
          }),
        ]
      : []),
  ]);
  for (const sale of sales) await completeIfSettled(sale.id, payment.paidDate);
}

// "Record Payment" on a sale that's on an unpaid invoice: the whole
// invoice was paid outside Stripe, on the date and by the method given.
export async function markInvoicePaid(invoiceId: string, formData: FormData): Promise<Result> {
  const invoice = await loadInvoice(invoiceId);
  if (!invoice) return { ok: false, error: "Invoice not found." };
  const closed = notOpenError(invoice);
  if (closed) return { ok: false, error: closed };

  const paid = readPaidDetails(formData);
  if ("error" in paid) return { ok: false, error: paid.error };
  if (!paid.method) return { ok: false, error: "Please choose the payment method." };

  await payInvoice(invoice, paid);
  return { ok: true };
}

// The invoice was paid through Stripe — its payment link (from the
// webhook) or Take Card (from the card form, and the webhook too). The
// PaymentIntent is re-read from the invoice's own Stripe account rather
// than trusted, and a repeat for the same PaymentIntent is ignored.
export async function recordInvoicePaymentIntent(invoiceId: string, paymentIntentId: string) {
  const invoice = await loadInvoice(invoiceId);
  if (!invoice || invoice.cancelledAt || invoice.paidAt) return;

  const intent = await getStripeClientForSale(invoice).paymentIntents.retrieve(paymentIntentId);
  if (intent.status !== "succeeded" || intent.metadata?.invoiceId !== invoiceId) return;
  const payments = [...invoice.payments, ...invoice.lines.flatMap((l) => l.purchase.payments)];
  if (payments.some((p) => p.stripePaymentIntentId === intent.id)) return;

  await payInvoice(invoice, { paidDate: new Date(), method: null, stripePaymentIntentId: intent.id });
}

// ---------- Cancelling ----------

// "Cancel invoice" — only while unpaid. Kept on record, marked
// cancelled, with its lines and costs; its sales are freed to be changed,
// paid or put on another invoice; its payment link is switched off.
export async function cancelInvoice(invoiceId: string): Promise<Result> {
  const invoice = await loadInvoice(invoiceId);
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (invoice.cancelledAt) return { ok: false, error: "This invoice was already cancelled." };
  if (invoice.paidAt) return { ok: false, error: "This invoice has been paid, so it can't be cancelled." };

  await db.$transaction([
    db.invoice.update({ where: { id: invoice.id }, data: { cancelledAt: new Date() } }),
    db.purchase.updateMany({ where: { invoiceId: invoice.id }, data: { invoiceId: null } }),
  ]);
  await retireInvoicePaymentLink(invoice);
  return { ok: true };
}
