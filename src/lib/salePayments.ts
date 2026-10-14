import { db } from "@/lib/db";
import { saleBreakdown } from "@/lib/saleMath";
import { settleInvoiceIfPaid } from "@/lib/invoices";

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
  await settleInvoiceIfPaid(purchase.invoiceId);
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
