// The one Net Due formula for a consigned (Gallery- or Own-location)
// sale. Used server-side (payment link amount, marking paid, invoice
// PDF) and client-side (sale card, Record Sale preview), so what's shown,
// charged and invoiced can never drift apart.
//
// A plain synchronous function (not a server action), so client
// components can call it directly.
//
//   Net Due = sale price
//           − commission (a gallery's % cut — sale price only)
//           − deposit already paid (Own-location sales)
//           + framing cost   (paid by the buyer/gallery)
//           + delivery cost  (paid by the buyer/gallery)
//
// Balance = Net Due − every PAID payment recorded so far (partial
// payments, instalments, payment-link payments alike). Pass `payments`
// to get it; without them paid is 0 and balance equals net.
//
// Accepts either client-side strings (PurchaseDetail) or Prisma Decimal
// values, so a Purchase row or a PurchaseDetail can be passed as-is.

type Amount = string | number | { toString(): string } | null | undefined;

export type SaleAmounts = {
  totalAmount: Amount;
  commissionPercent?: Amount;
  depositPaid?: Amount;
  framingCost?: Amount;
  deliveryCost?: Amount;
  payments?: { amount: Amount; status: string }[];
};

function num(value: Amount): number {
  if (value == null || value === "") return 0;
  return parseFloat(String(value)) || 0;
}

export function saleBreakdown(a: SaleAmounts) {
  const salePrice = num(a.totalAmount);
  const commissionPercent = num(a.commissionPercent);
  const commission = salePrice * (commissionPercent / 100);
  const deposit = num(a.depositPaid);
  const framing = num(a.framingCost);
  const delivery = num(a.deliveryCost);
  const net = salePrice - commission - deposit + framing + delivery;
  const paid = (a.payments ?? [])
    .filter((p) => p.status === "PAID")
    .reduce((sum, p) => sum + num(p.amount), 0);
  // Rounded to pennies so floating-point dust never leaves a sale
  // "£0.00 still due" and uncompletable.
  const balance = Math.max(Math.round((net - paid) * 100) / 100, 0);
  return { salePrice, commissionPercent, commission, deposit, framing, delivery, net, paid, balance };
}

export function netOwed(a: SaleAmounts): number {
  return saleBreakdown(a).net;
}

// Splits a total into `count` instalments of equal size, with any
// rounding remainder absorbed into the final instalment so the parts
// always sum exactly back to the total. Here (not lib/stripe.ts) so the
// sale card can show the same per-instalment figure Stripe will charge.
export function splitIntoInstalments(total: number, count: number): number[] {
  const base = Math.round((total / count) * 100) / 100;
  const amounts = Array(count - 1).fill(base);
  const runningTotal = Math.round(base * (count - 1) * 100) / 100;
  const last = Math.round((total - runningTotal) * 100) / 100;
  amounts.push(last);
  return amounts;
}

// A sale's display title: the artwork's title, or for a framing/delivery
// charge sale (Purchase.chargeKind) "[artwork] Framing Charge" /
// "[artwork] Delivery Charge". Used everywhere a sale is named — lists,
// invoices, emails, alerts — so a charge is never mistaken for the
// artwork's own sale.
export function saleTitle(artworkTitle: string, chargeKind?: string | null): string {
  if (chargeKind === "FRAMING") return `${artworkTitle} Framing Charge`;
  if (chargeKind === "DELIVERY") return `${artworkTitle} Delivery Charge`;
  return artworkTitle;
}
