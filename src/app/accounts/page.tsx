import Link from "next/link";
import AppShell from "@/components/AppShell";
import { db } from "@/lib/db";
import { getOpenAlerts } from "@/lib/alerts";
import { buildTopNavItems } from "@/lib/topNav";
import AccountsBackfillButton from "@/components/AccountsBackfillButton";
import AccountsPeriodView from "@/components/AccountsPeriodView";

export const dynamic = "force-dynamic";

type MonthGroup = {
  key: string; // "2026-08"
  label: string; // "August 2026"
  totalsByCurrency: Record<string, number>;
  rows: {
    artistName: string;
    amount: number;
    currency: string;
    paidAt: Date;
    source: string;
    paymentMethod: string | null;
  }[];
};

export default async function AccountsPage() {
  const payments = await db.subscriptionPayment.findMany({
    include: { artist: { select: { name: true, paymentMethod: true } } },
    orderBy: { paidAt: "desc" },
  });
  const openAlerts = await getOpenAlerts();

  const months = new Map<string, MonthGroup>();
  for (const p of payments) {
    const key = `${p.paidAt.getFullYear()}-${String(p.paidAt.getMonth() + 1).padStart(2, "0")}`;
    if (!months.has(key)) {
      months.set(key, {
        key,
        label: p.paidAt.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        totalsByCurrency: {},
        rows: [],
      });
    }
    const group = months.get(key)!;
    const amount = parseFloat(p.amount.toString());
    group.totalsByCurrency[p.currency] = (group.totalsByCurrency[p.currency] || 0) + amount;
    group.rows.push({
      artistName: p.artist.name,
      amount,
      currency: p.currency,
      paidAt: p.paidAt,
      source: p.source,
      paymentMethod: p.artist.paymentMethod,
    });
  }
  const sortedMonths = Array.from(months.values()).sort((a, b) => (a.key < b.key ? 1 : -1));

  // Passed to the client component rather than letting it call `new
  // Date()` itself — keeps "This Year"/Q1–Q4 tied to the server's clock.
  const currentYear = new Date().getFullYear();

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("accounts", openAlerts.length)}
      content={
        <div className="mx-auto max-w-3xl px-6 py-6">
          <div className="mb-1 flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-neutral-900">Accounts</h1>
            <Link
              href="/accounts/sales"
              className="text-sm text-neutral-500 underline-offset-2 hover:underline"
            >
              Consolidated Sales →
            </Link>
          </div>
          <p className="mb-6 text-sm text-neutral-500">
            Subscription revenue by month — artists paying us. Stripe and manually-entered
            payments together. Totals are kept separate per currency rather than combined, since
            converting between them isn&apos;t something to do silently. For artists&apos; own
            sales to their buyers, see Consolidated Sales.
          </p>

          <AccountsBackfillButton />

          {sortedMonths.length === 0 ? (
            <p className="text-sm text-neutral-500">No subscription payments recorded yet.</p>
          ) : (
            <AccountsPeriodView sortedMonths={sortedMonths} currentYear={currentYear} />
          )}
        </div>
      }
    />
  );
}


