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
// Accepts either client-side strings (PurchaseDetail) or Prisma Decimal
// values, so a Purchase row or a PurchaseDetail can be passed as-is.

type Amount = string | number | { toString(): string } | null | undefined;

export type SaleAmounts = {
  totalAmount: Amount;
  commissionPercent?: Amount;
  depositPaid?: Amount;
  framingCost?: Amount;
  deliveryCost?: Amount;
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
  return { salePrice, commissionPercent, commission, deposit, framing, delivery, net };
}

export function netOwed(a: SaleAmounts): number {
  return saleBreakdown(a).net;
}
