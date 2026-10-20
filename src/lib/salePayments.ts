import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { saleBreakdown, type SaleAmounts } from "@/lib/saleMath";
import { retireInvoicePaymentLink, settleInvoiceIfPaid } from "@/lib/invoices";
import { retireStatementLinksListing } from "@/lib/paymentLinks";

// Shared server-side steps for recording payments against a sale — used
// by a sale's own payments (lib/actions/payments.ts) and by paying a
// whole invoice (lib/actions/invoices.ts). Not a "use server" file, so
// none of these can be called from the browser.

// Completes a sale once it's fully paid, and marks its artwork SOLD.
// "Fully paid" depends on the channel:
//   - GALLERY (consigned): the balance — Net Due less every PAID
//     payment (saleBreakdown(), lib/saleMath.ts) — has reached zero.
//     Payments can arrive in any mix: partial payments recorded by hand,
//     a payment link, an invoice paid, or an instalment plan.
//   - STRIPE (direct): every scheduled Payment row is PAID — a Full
//     sale has one; an instalment sale completes once the last clears.
// The sale's invoice is then marked paid too, once every sale on it is.
// Its invoice's payment link is switched off while other works on it are
// still owed — that amount has just changed (2026-10-20, works on a
// gallery invoice paid one at a time) — and so is any statement's
// listing it.
// Safe to call after any payment; does nothing until the sale is settled.
export async function completeIfSettled(purchaseId: string, closedAt: Date = new Date()) {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: { payments: true },
    relationLoadStrategy: "query",
  });
  if (!purchase || purchase.status !== "ACTIVE") return;

  const settled =
    purchase.channel === "GALLERY"
      ? saleBreakdown(purchase).balance <= 0
      : purchase.payments.every((p) => p.status === "PAID");
  if (!settled) return;

  await db.purchase.update({ where: { id: purchaseId }, data: { status: "COMPLETED", closedAt } });
  if (!purchase.parentPurchaseId) {
    await db.artwork.update({ where: { id: purchase.artworkId }, data: { availability: "SOLD" } });
  }
  await retireStatementLinksListing(purchase.id);
  await settleInvoiceIfPaid(purchase.invoiceId);
  if (purchase.invoiceId) {
    const invoice = await db.invoice.findUnique({
      where: { id: purchase.invoiceId },
      select: { id: true, paidAt: true, stripeMode: true, stripeAccountId: true, stripePaymentLinkId: true },
    });
    if (invoice && !invoice.paidAt) await retireInvoicePaymentLink(invoice);
  }
}

// How a payment was made: when, by what method, and the Stripe payment
// if it came through Stripe.
export type PaidDetails = { paidDate: Date; method: string | null; stripePaymentIntentId?: string };

// Pays several sales in full at once — each still-owed sale's whole
// balance as its own PAID payment (with `extra` writes, e.g. an invoice's
// own framing/delivery, in the same transaction) — then completes them.
// Shared by paying a whole invoice and a statement.
export async function payBalancesInFull(
  sales: (SaleAmounts & {
    id: string;
    status: string;
    currency: string;
    payments: { sequence: number; amount: { toString(): string }; status: string }[];
  })[],
  paid: PaidDetails,
  extra: Prisma.PrismaPromise<unknown>[] = []
) {
  const owed = sales
    .filter((sale) => sale.status === "ACTIVE")
    .map((sale) => ({ sale, balance: saleBreakdown(sale).balance }))
    .filter(({ balance }) => balance > 0);
  await db.$transaction([
    ...owed.map(({ sale, balance }) =>
      db.payment.create({
        data: {
          purchaseId: sale.id,
          sequence: nextSequence(sale.payments),
          amount: balance.toFixed(2),
          currency: sale.currency,
          status: "PAID",
          paidDate: paid.paidDate,
          method: paid.method,
          stripePaymentIntentId: paid.stripePaymentIntentId ?? null,
        },
      })
    ),
    ...extra,
  ]);
  for (const { sale } of owed) await completeIfSettled(sale.id, paid.paidDate);
}

// The next Payment.sequence for a sale — payments on a consigned sale
// can arrive in any number and order (partial payments, a link,
// instalments), so this is always "after the last one", never a fixed 1.
export function nextSequence(payments: { sequence: number }[]): number {
  return payments.reduce((max, p) => Math.max(max, p.sequence), 0) + 1;
}

// Reads the optional Date paid and Method a payment form sends. No date
// means now; no method means none recorded.
export function readPaidDetails(
  formData: FormData
): { paidDate: Date; method: string | null } | { error: string } {
  const paidDateRaw = (formData.get("paidDate") as string | null)?.trim();
  const method = (formData.get("method") as string | null)?.trim() || null;

  if (!paidDateRaw) return { paidDate: new Date(), method };
  const parsed = new Date(paidDateRaw);
  if (Number.isNaN(parsed.getTime())) return { error: "That date isn't valid." };
  return { paidDate: parsed, method };
}
