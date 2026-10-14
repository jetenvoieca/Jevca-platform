import { db } from "@/lib/db";
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
      lines: {
        orderBy: { position: "asc" },
        include: {
          purchase: {
            include: {
              artwork: { select: { catalogueName: true } },
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

// Why a sale can't be changed, paid or cancelled on its own right now:
// it's on an invoice that hasn't been paid. Null when it's free.
export async function invoiceLockError(invoiceId: string | null): Promise<string | null> {
  if (!invoiceId) return null;
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: { number: true, paidAt: true },
  });
  if (!invoice || invoice.paidAt) return null;
  return `This sale is on invoice ${formatInvoiceNumber(invoice.number)} — cancel the invoice first.`;
}

// Switches off an invoice's payment link in Stripe (it's been paid, or
// cancelled, or what it charges is out of date) and clears it, so the
// next "Payment link" makes a fresh one.
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

// Marks an invoice paid once every sale on it is paid — dated the day
// the last one was — and switches off its payment link so it can't be
// paid twice. Safe to call after any payment; does nothing until then.
export async function settleInvoiceIfPaid(invoiceId: string | null) {
  if (!invoiceId) return;
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    relationLoadStrategy: "query",
    include: { sales: { select: { status: true, closedAt: true } } },
  });
  if (!invoice || invoice.paidAt || invoice.cancelledAt || invoice.sales.length === 0) return;
  if (!invoice.sales.every((s) => s.status === "COMPLETED")) return;

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
