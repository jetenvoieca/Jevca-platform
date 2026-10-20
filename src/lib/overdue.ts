// When a sale is OVERDUE (2026-10-20, direct request — shown instead of
// UNPAID, to help choose what goes on a gallery's statement): it's still
// owed and on an unpaid invoice produced more than its client's
// Artist.invoiceOverdueDays ago — the same rule as the overdue alert
// (lib/alerts.ts). A sale not on an invoice is never overdue. Pure, so it
// can run anywhere.

const DAY = 24 * 60 * 60 * 1000;

export function isSaleOverdue(
  sale: {
    status: string;
    invoice: { createdAt: Date; paidAt: Date | null; cancelledAt: Date | null } | null;
  },
  overdueDays: number,
  now: number = Date.now()
): boolean {
  const invoice = sale.invoice;
  if (sale.status !== "ACTIVE" || !invoice || invoice.paidAt || invoice.cancelledAt) return false;
  return now - invoice.createdAt.getTime() > overdueDays * DAY;
}

// What a sale's invoice needs loading for isSaleOverdue.
export const overdueInvoiceSelect = { select: { createdAt: true, paidAt: true, cancelledAt: true } } as const;
