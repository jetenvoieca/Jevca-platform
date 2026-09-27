import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { buildAccountMonths } from "@/lib/accountMonths";
import AccountSummaryView from "@/components/AccountSummaryView";

// Same reasoning as sales/page.tsx — a payment or expense recorded
// elsewhere must show here without a stale cached copy.
export const dynamic = "force-dynamic";

// The artist's own Account (2026-09-27) — same table as the platform's
// Account page. Sales = every PAID payment, in the month it was actually
// paid (an instalment sale spreads across the months each instalment
// landed). Expenses = the artist's Purchases. Scoped by artistId, same
// as Sales and Payments received (an artist's sales are shared across
// any of their sites).
export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const site = await db.site.findUnique({
    where: { id },
    select: { artistId: true },
  });
  if (!site) notFound();

  const [payments, expenses] = await Promise.all([
    db.payment.findMany({
      where: { status: "PAID", purchase: { artwork: { artistId: site.artistId } } },
      select: { amount: true, currency: true, paidDate: true, createdAt: true },
    }),
    db.expense.findMany({
      where: { artistId: site.artistId },
      select: { amount: true, currency: true, date: true },
    }),
  ]);

  const now = new Date();
  const sortedMonths = buildAccountMonths(
    // paidDate is always set once a payment is PAID, but the column is
    // nullable — same createdAt fallback as the Payments received report.
    payments.map((p) => ({ amount: p.amount, currency: p.currency, date: p.paidDate ?? p.createdAt })),
    expenses,
    now
  );

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Account</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Payments received against your Purchases, by month. Each currency has its own set of
        columns, kept separate rather than combined.
      </p>

      <AccountSummaryView sortedMonths={sortedMonths} currentYear={now.getFullYear()} />
    </div>
  );
}
