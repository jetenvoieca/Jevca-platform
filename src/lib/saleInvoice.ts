import { invoiceForSale } from "@/lib/actions/invoices";
import type { PurchaseDetail } from "@/lib/actions/payments";
import { formatInvoiceNumber } from "@/lib/invoiceNumber";

// Which invoice to open for a sale (2026-10-14) — its current invoice,
// or (for a cancelled sale) the last one it was on; otherwise one is
// produced now (invoiceForSale: an invoice of one, or for a paid sale its
// receipt). Safe to use from client components.
export async function invoiceToOpen(
  sale: Pick<PurchaseDetail, "id" | "status" | "invoices">
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const live = sale.invoices.find((i) => !i.cancelledAt);
  if (live) return { ok: true, invoiceId: live.id };
  if (sale.status === "ABANDONED") {
    const last = sale.invoices.at(-1);
    return last ? { ok: true, invoiceId: last.id } : { ok: false, error: "This sale was cancelled." };
  }
  return invoiceForSale(sale.id);
}

// Whether a sale has an invoice to open at all — a cancelled sale only
// if it was ever invoiced.
export function hasInvoiceToOpen(sale: Pick<PurchaseDetail, "status" | "invoices">): boolean {
  return sale.status !== "ABANDONED" || sale.invoices.length > 0;
}

// The line a Cancel / Delete sale confirmation adds when the sale is on
// an unpaid invoice (2026-10-20), which cancelling or deleting it cancels
// too — see cancelUnpaidInvoicesOf. Empty when it isn't.
export function invoiceCancelNote(sale: Pick<PurchaseDetail, "invoices">): string {
  const live = sale.invoices.find((i) => !i.cancelledAt && !i.paidAt);
  if (!live) return "";
  const otherCount = live.saleCount - 1;
  const others =
    otherCount === 0
      ? ""
      : ` Its other ${otherCount === 1 ? "sale is" : `${otherCount} sales are`} freed, ready to invoice again.`;
  return ` This also cancels invoice ${formatInvoiceNumber(live.number)} and switches off its payment link.${others}`;
}
