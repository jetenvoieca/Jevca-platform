"use server";

import { db } from "@/lib/db";
import { saleBreakdown, saleTitle } from "@/lib/saleMath";
import { getPublishableKey, getStripeClientForSale, toMinorUnits } from "@/lib/stripe";
import type { CardEntry } from "@/lib/actions/payments";
import { retireGalleryPaymentLinks } from "@/lib/paymentLinks";
import { completeIfSettled, nextSequence, readPaidDetails } from "@/lib/salePayments";
import { buyerKey, loadInvoice, retireInvoicePaymentLink, type LoadedInvoice } from "@/lib/invoices";
import { formatInvoiceNumber } from "@/lib/invoiceNumber";

// Invoices (2026-10-14, Craig's mockup) — see Invoice in schema.prisma.
// A sale's invoice is produced from its own card (an invoice of one,
// which is also how a paid sale gets its receipt), or several unpaid
// consigned sales are ticked on a location's Sales tab and put on one
// invoice. It's then paid in full from the invoice window (Mark as paid)
// or through its payment link, or cancelled — kept on record, its sales
// freed. While unpaid, its sales can't be changed or paid on their own
// (invoiceLockError, lib/invoices.ts).

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function stripeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Something went wrong talking to Stripe.";
}

// ---------- Producing ----------

// "Produce Invoice" on a location's Sales tab: one invoice for every
// ticked sale. They must be consigned sales of the same location and
// buyer, in the same currency and Stripe account, not framing/delivery
// charges (those are invoiced on their own), and not already on an
// invoice — and either all unpaid (not being paid by instalments), or
// all already paid (2026-10-14: then it's their receipt, already marked
// paid). An unpaid invoice gets the next number, today's date, and a
// payment link for the whole balance so the emailed invoice always
// includes a way to pay (if Stripe can't make one, the invoice is still
// produced and the link can be made later).
export async function produceInvoice(purchaseIds: string[]): Promise<Result<{ invoiceId: string }>> {
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

  // Ordered as ticked, which is the table's order.
  const ordered = ids.map((id) => sales.find((s) => s.id === id)!);
  // A receipt is dated the day the last of its sales was paid.
  const lastPaid = ordered.reduce<Date | null>(
    (latest, s) => (s.closedAt && (!latest || s.closedAt > latest) ? s.closedAt : latest),
    null
  );
  const created = await createInvoice(ordered, paid ? (lastPaid ?? new Date()) : null);
  if (!created.ok || paid) return created;

  for (const sale of ordered) await retireGalleryPaymentLinks(sale);
  await createInvoicePaymentLink(created.invoiceId);
  return created;
}

// The invoice to open from a sale's own card or panel ("Send invoice",
// "Send Receipt", a past sale's Invoice/Receipt): its current invoice,
// or else a new invoice of one — for a paid sale, already marked paid,
// so it's its receipt. A cancelled sale gets no new invoice.
export async function invoiceForSale(purchaseId: string): Promise<Result<{ invoiceId: string }>> {
  const sale = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: { artwork: { select: { artistId: true } }, payments: true },
    relationLoadStrategy: "query",
  });
  if (!sale) return { ok: false, error: "Sale not found." };
  if (sale.invoiceId) return { ok: true, invoiceId: sale.invoiceId };
  if (sale.status === "ABANDONED") return { ok: false, error: "This sale was cancelled." };

  const isPaid = sale.status === "COMPLETED";
  const created = await createInvoice([sale], isPaid ? (sale.closedAt ?? new Date()) : null);
  if (!created.ok) return created;

  // An unpaid consigned sale's invoice gets a payment link straight away,
  // replacing the sale's own — unless it's being paid by instalments.
  if (!isPaid && sale.channel === "GALLERY" && !sale.stripeSubscriptionScheduleId) {
    await retireGalleryPaymentLinks(sale);
    await createInvoicePaymentLink(created.invoiceId);
  }
  return created;
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
  paidAt: Date | null
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
          paidAt,
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

// What's still owed on an invoice: every live sale's balance.
function invoiceBalance(invoice: LoadedInvoice): number {
  return invoice.lines
    .filter((l) => l.purchase.invoiceId === invoice.id)
    .reduce((sum, l) => sum + saleBreakdown(l.purchase).balance, 0);
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

// Why an invoice can't be paid, linked or cancelled right now.
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
// Checkout Session, which expires within a day) for the whole balance,
// one line per sale. Made once and reused; switched off when the invoice
// is paid or cancelled. invoiceId rides on the PaymentIntent's own
// metadata (Payment Link metadata doesn't reach it) — that's how the
// webhook recognises the payment (recordInvoicePaymentIntent).
export async function createInvoicePaymentLink(invoiceId: string): Promise<Result<{ url: string }>> {
  try {
    const invoice = await loadInvoice(invoiceId);
    if (!invoice) return { ok: false, error: "Invoice not found." };
    const closed = notOpenError(invoice);
    if (closed) return { ok: false, error: closed };
    if (invoice.stripePaymentLinkUrl) return { ok: true, url: invoice.stripePaymentLinkUrl };

    const stripe = getStripeClientForSale(invoice);
    const lineItems = [];
    for (const { purchase } of invoice.lines) {
      const { balance } = saleBreakdown(purchase);
      if (balance <= 0) continue;
      const price = await stripe.prices.create({
        unit_amount: toMinorUnits(balance),
        currency: invoice.currency.toLowerCase(),
        product_data: { name: saleTitle(purchase.artwork.catalogueName, purchase.chargeKind) },
      });
      lineItems.push({ price: price.id, quantity: 1 });
    }
    if (lineItems.length === 0) return { ok: false, error: "Nothing is left to pay on this invoice." };

    const link = await stripe.paymentLinks.create({
      line_items: lineItems,
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

// "Take Card" on a sale that's on an unpaid invoice (2026-10-14): the
// whole invoice is paid by card, entered in the app by the artist with
// Stripe's own card form (StripeCardForm), into the invoice's Stripe
// account. invoiceId rides on the PaymentIntent's metadata, so the card
// form and the webhook both record it with recordInvoicePaymentIntent.
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

// Records every sale on the invoice as paid in full — each sale's
// balance as its own PAID payment — then completes them, which marks the
// invoice paid (settleInvoiceIfPaid). Shared by Mark as paid and the
// payment link.
async function payInvoiceSales(
  invoice: LoadedInvoice,
  payment: { paidDate: Date; method: string | null; stripePaymentIntentId?: string }
) {
  const sales = invoice.lines.map((l) => l.purchase).filter((s) => s.invoiceId === invoice.id);
  await db.$transaction(
    sales
      .map((sale) => ({ sale, balance: saleBreakdown(sale).balance }))
      .filter(({ balance }) => balance > 0)
      .map(({ sale, balance }) =>
        db.payment.create({
          data: {
            purchaseId: sale.id,
            sequence: nextSequence(sale.payments),
            amount: balance.toFixed(2),
            currency: sale.currency,
            status: "PAID",
            paidDate: payment.paidDate,
            method: payment.method,
            stripePaymentIntentId: payment.stripePaymentIntentId ?? null,
          },
        })
      )
  );
  for (const sale of sales) {
    await retireGalleryPaymentLinks(sale);
    await completeIfSettled(sale.id, payment.paidDate);
  }
}

// "Mark as paid" in the invoice window: the whole invoice was paid
// outside Stripe, on the date and by the method given.
export async function markInvoicePaid(invoiceId: string, formData: FormData): Promise<Result> {
  const invoice = await loadInvoice(invoiceId);
  if (!invoice) return { ok: false, error: "Invoice not found." };
  const closed = notOpenError(invoice);
  if (closed) return { ok: false, error: closed };

  const paid = readPaidDetails(formData);
  if ("error" in paid) return { ok: false, error: paid.error };
  if (!paid.method) return { ok: false, error: "Please choose the payment method." };

  await payInvoiceSales(invoice, paid);
  return { ok: true };
}

// The invoice's payment link was paid (from the Stripe webhook). The
// PaymentIntent is re-read from the invoice's own Stripe account rather
// than trusted, and a repeat for the same PaymentIntent is ignored.
export async function recordInvoicePaymentIntent(invoiceId: string, paymentIntentId: string) {
  const invoice = await loadInvoice(invoiceId);
  if (!invoice || invoice.cancelledAt || invoice.paidAt) return;

  const intent = await getStripeClientForSale(invoice).paymentIntents.retrieve(paymentIntentId);
  if (intent.status !== "succeeded" || intent.metadata?.invoiceId !== invoiceId) return;
  const alreadyRecorded = invoice.lines.some((l) =>
    l.purchase.payments.some((p) => p.stripePaymentIntentId === intent.id)
  );
  if (alreadyRecorded) return;

  await payInvoiceSales(invoice, { paidDate: new Date(), method: null, stripePaymentIntentId: intent.id });
}

// ---------- Cancelling ----------

// "Cancel invoice" — only while unpaid. Kept on record, marked
// cancelled, with its lines; its sales are freed to be changed, paid or
// put on another invoice; its payment link is switched off.
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
