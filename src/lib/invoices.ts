import { db } from "@/lib/db";
import { saleBreakdown } from "@/lib/saleMath";
import { deactivatePaymentLink } from "@/lib/paymentLinks";
import { formatInvoiceNumber } from "@/lib/invoiceNumber";
import type { SaleInvoice } from "@/lib/actions/payments";

// Shared server-side helpers for invoices (2026-10-14) — see Invoice in
// schema.prisma. Kept out of the "use server" actions files so payments,
// the PDF and the emails can all use them without them becoming actions
// the browser could call directly.

// An invoice with everything its document, email and payment link need:
// each sale on it in order (cancelled invoices included), with its
// artwork, artist, location/customer and payments.
export async function loadInvoice(invoiceId: string) {
  return db.invoice.findUnique({
    where: { id: invoiceId },
    relationLoadStrategy: "query",
    include: {
      artist: true,
      payments: { orderBy: { sequence: "asc" } },
      lines: {
        orderBy: { position: "asc" },
        include: {
          purchase: {
            include: {
              artwork: {
                select: {
                  catalogueName: true,
                  type: true,
                  size: true,
                  medium: true,
                  mainImage: { select: { displayKey: true } },
                  images: { take: 1, select: { displayKey: true } },
                },
              },
              customer: true,
              payments: { orderBy: { sequence: "asc" } },
            },
          },
        },
      },
    },
  });
}

export type LoadedInvoice = NonNullable<Awaited<ReturnType<typeof loadInvoice>>>;
export type InvoiceSale = LoadedInvoice["lines"][number]["purchase"];

function num(value: { toString(): string } | null | undefined): number {
  return value == null ? 0 : parseFloat(value.toString()) || 0;
}

function pennies(n: number): number {
  return Math.round(n * 100) / 100;
}

// The invoice's own framing and delivery costs (2026-10-14) and what's
// been paid towards them — see Invoice.framingCost.
export function invoiceExtras(invoice: {
  framingCost: { toString(): string } | null;
  deliveryCost: { toString(): string } | null;
  payments: { amount: { toString(): string }; status: string }[];
}) {
  const framing = num(invoice.framingCost);
  const delivery = num(invoice.deliveryCost);
  const paid = invoice.payments.filter((p) => p.status === "PAID").reduce((sum, p) => sum + num(p.amount), 0);
  return { framing, delivery, paid, balance: Math.max(pennies(framing + delivery - paid), 0) };
}

// What's still owed on an invoice: every sale still on it (its balance —
// lib/saleMath.ts), plus its own framing and delivery.
export function invoiceBalance(invoice: LoadedInvoice): number {
  const sales = invoice.lines
    .map((l) => l.purchase)
    .filter((s) => s.invoiceId === invoice.id)
    .reduce((sum, s) => sum + saleBreakdown(s).balance, 0);
  return pennies(sales + invoiceExtras(invoice).balance);
}

// Who an invoice is for. A real Gallery-type Location's sale goes to the
// gallery — its contact person if one is on file, else its general
// email. Anything else (an Own-location sale or a direct sale) goes to
// the buyer recorded on the sale. Every sale on one invoice has the same
// location and buyer (checked when it's produced), so the first sale
// speaks for them all.
export function invoiceParty(sale: InvoiceSale) {
  const isGallery = sale.customer?.kind === "GALLERY";
  const email = isGallery
    ? sale.customer?.contactEmail || sale.customer?.email || null
    : sale.buyerEmail;
  const firstName = isGallery
    ? sale.customer?.contactName?.trim().split(/\s+/)[0] || sale.customer?.name || null
    : sale.buyerName?.trim().split(/\s+/)[0] || null;
  return { isGallery, email, firstName };
}

// The same buyer, for deciding whether sales can share an invoice: the
// location for a gallery's sales, and the buyer's own name and email for
// anything else.
export function buyerKey(sale: {
  customerId: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  customer: { kind: string } | null;
}): string {
  if (sale.customer?.kind === "GALLERY") return `location:${sale.customerId}`;
  return [
    sale.customerId ?? "",
    (sale.buyerName ?? "").trim().toLowerCase(),
    (sale.buyerEmail ?? "").trim().toLowerCase(),
  ].join("|");
}

// Why a sale can't be changed or paid on its own right now: it's on an
// invoice that hasn't been paid. Null when it's free. (Cancelling or
// deleting the sale cancels the invoice instead — see
// cancelUnpaidInvoicesOf.)
export async function invoiceLockError(invoiceId: string | null): Promise<string | null> {
  if (!invoiceId) return null;
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: { number: true, paidAt: true },
  });
  if (!invoice || invoice.paidAt) return null;
  return `This sale is on invoice ${formatInvoiceNumber(invoice.number)} — cancel the invoice first.`;
}

// Cancels an unpaid invoice: kept on record, marked Cancelled (its lines
// and costs kept), its sales freed and its payment link switched off.
// Shared by Cancel invoice and by cancelling or deleting one of its
// sales. Does nothing to a paid or already cancelled invoice.
export async function cancelUnpaidInvoice(invoiceId: string): Promise<void> {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      paidAt: true,
      cancelledAt: true,
      stripeMode: true,
      stripeAccountId: true,
      stripePaymentLinkId: true,
    },
  });
  if (!invoice || invoice.paidAt || invoice.cancelledAt) return;
  await db.$transaction([
    db.invoice.update({ where: { id: invoice.id }, data: { cancelledAt: new Date() } }),
    db.purchase.updateMany({ where: { invoiceId: invoice.id }, data: { invoiceId: null } }),
  ]);
  await retireInvoicePaymentLink(invoice);
}

// Cancel Sale / Delete Sale on a sale that's on an unpaid invoice
// (2026-10-20, direct request — was "cancel the invoice first"): the
// whole invoice is cancelled, freeing any other sales on it to be
// invoiced again. Takes the sale and its framing/delivery charges.
export async function cancelUnpaidInvoicesOf(sales: { invoiceId: string | null }[]): Promise<void> {
  const ids = new Set(sales.map((s) => s.invoiceId).filter((id): id is string => id !== null));
  for (const id of ids) await cancelUnpaidInvoice(id);
}

// Switches off an invoice's payment link in Stripe (it's been paid, or
// cancelled, or what it charges is out of date) and clears it; a fresh
// one is made when the invoice's email is next drafted.
export async function retireInvoicePaymentLink(invoice: {
  id: string;
  stripeMode: "TEST" | "LIVE";
  stripeAccountId: string | null;
  stripePaymentLinkId: string | null;
}) {
  if (!invoice.stripePaymentLinkId) return;
  await deactivatePaymentLink(invoice, invoice.stripePaymentLinkId);
  await db.invoice.update({
    where: { id: invoice.id },
    data: { stripePaymentLinkId: null, stripePaymentLinkUrl: null },
  });
}

// Every unpaid invoice with one of this artwork's sales on it loses its
// payment link — used when the artwork is renamed, since the name is
// fixed inside Stripe when a link is made. A fresh link is made when the
// invoice's email is next drafted.
export async function retireArtworkInvoiceLinks(artworkId: string) {
  const invoices = await db.invoice.findMany({
    where: {
      paidAt: null,
      cancelledAt: null,
      stripePaymentLinkId: { not: null },
      sales: { some: { artworkId } },
    },
    select: { id: true, stripeMode: true, stripeAccountId: true, stripePaymentLinkId: true },
  });
  for (const invoice of invoices) await retireInvoicePaymentLink(invoice);
}

// Marks an invoice paid once every sale on it is paid, and its own
// framing and delivery — dated the day the last sale was — and switches
// off its payment link so it can't be
// paid twice. Safe to call after any payment; does nothing until then.
export async function settleInvoiceIfPaid(invoiceId: string | null) {
  if (!invoiceId) return;
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    relationLoadStrategy: "query",
    include: {
      sales: { select: { status: true, closedAt: true } },
      payments: { select: { amount: true, status: true } },
    },
  });
  if (!invoice || invoice.paidAt || invoice.cancelledAt || invoice.sales.length === 0) return;
  if (!invoice.sales.every((s) => s.status === "COMPLETED")) return;
  if (invoiceExtras(invoice).balance > 0) return;

  const paidAt = invoice.sales.reduce<Date>(
    (latest, s) => (s.closedAt && s.closedAt > latest ? s.closedAt : latest),
    new Date(0)
  );
  await db.invoice.update({
    where: { id: invoice.id },
    data: { paidAt: paidAt.getTime() > 0 ? paidAt : new Date() },
  });
  await retireInvoicePaymentLink(invoice);
}

// What to load with a sale to list the invoices it is or was on, oldest
// first, as a SaleInvoice (toSaleInvoices) — for the sale card and the
// Sales tab.
export const saleInvoicesInclude = {
  orderBy: { invoice: { createdAt: "asc" } },
  select: {
    invoice: {
      select: {
        id: true,
        number: true,
        createdAt: true,
        emailedAt: true,
        receiptEmailedAt: true,
        paidAt: true,
        cancelledAt: true,
        _count: { select: { lines: true } },
      },
    },
  },
} as const;

type LoadedSaleInvoiceLine = {
  invoice: {
    id: string;
    number: number;
    createdAt: Date;
    emailedAt: Date | null;
    receiptEmailedAt: Date | null;
    paidAt: Date | null;
    cancelledAt: Date | null;
    _count: { lines: number };
  };
};

export function toSaleInvoices(lines: LoadedSaleInvoiceLine[]): SaleInvoice[] {
  return lines.map(({ invoice }) => ({
    id: invoice.id,
    number: invoice.number,
    createdAt: invoice.createdAt.toISOString(),
    emailedAt: invoice.emailedAt?.toISOString() ?? null,
    receiptEmailedAt: invoice.receiptEmailedAt?.toISOString() ?? null,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    cancelledAt: invoice.cancelledAt?.toISOString() ?? null,
    saleCount: invoice._count.lines,
  }));
}
