// Shared net-owed calculation for a consigned (Gallery- or Own-location)
// sale (2026-09-22) — used both server-side (lib/actions/payments.ts,
// when generating a payment link or completing a sale as paid) and
// client-side (GallerySaleCard, GalleriesView, for the live preview
// before anything is saved). One formula, so the amount actually
// charged/recorded can never drift from what's shown on screen.
//
// Not a server action (no "use server") — a plain, synchronous, pure
// function so it can be called directly from client components too,
// with no network round trip.
//
// commissionPercent is only ever set for a GALLERY-type Location's sale
// (the gallery's cut); depositPaid is only ever set for an OWN-type
// Location's sale (money already collected on the spot from the actual
// buyer). A sale only ever has one of the two in practice — Own
// locations always have 0% commission, Gallery sales never record a
// deposit — but both are subtracted unconditionally here so the formula
// works the same way regardless of which one actually applies.
export function netOwed(
  totalAmount: string,
  commissionPercent: string | null | undefined,
  depositPaid?: string | null
): number {
  const total = parseFloat(totalAmount) || 0;
  const commission = commissionPercent ? parseFloat(commissionPercent) || 0 : 0;
  const deposit = depositPaid ? parseFloat(depositPaid) || 0 : 0;
  return total - total * (commission / 100) - deposit;
}
