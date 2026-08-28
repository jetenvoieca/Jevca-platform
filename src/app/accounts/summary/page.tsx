import AppShell from "@/components/AppShell";
import { db } from "@/lib/db";
import { getOpenAlerts } from "@/lib/alerts";
import { buildTopNavItems } from "@/lib/topNav";
import AccountSummaryView from "@/components/AccountSummaryView";

export const dynamic = "force-dynamic";

type MonthRow = {
  key: string;
  label: string;
  salesByCurrency: Record<string, number>;
  expensesByCurrency: Record<string, number>;
};

// The simple platform-level balance view (2026-08-28) — Sales here means
// the platform's own subscription revenue (same source as the
// Subscriptions page), against the platform's own Expenses, by month.
// Deliberately not the same thing as Consolidated Sales, which is every
// artist's sales to their own buyers — this page is specifically the
// owner's own P&L, not artists' activity.
//
// Widened to max-w-5xl and moved to per-currency columns (2026-08-28) —
// the original single-column-per-currency-pair layout wrapped badly
// once GBP and EUR both had real numbers in them.
export default async function AccountSummaryPage() {
  const [payments, expenses, openAlerts] = await Promise.all([
    db.subscriptionPayment.findMany({ select: { amount: true, currency: true, paidAt: true } }),
    db.platformExpense.findMany({ select: { amount: true, currency: true, date: true } }),
    getOpenAlerts(),
  ]);

  const months = new Map<string, MonthRow>();
  function group(date: Date): MonthRow {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!months.has(key)) {
      months.set(key, {
        key,
        label: date.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        salesByCurrency: {},
        expensesByCurrency: {},
      });
    }
    return months.get(key)!;
  }

  for (const p of payments) {
    if (Number.isNaN(p.paidAt.getTime())) continue; // same guard as elsewhere on Accounts
    const g = group(p.paidAt);
    const amount = parseFloat(p.amount.toString());
    g.salesByCurrency[p.currency] = (g.salesByCurrency[p.currency] || 0) + amount;
  }
  for (const e of expenses) {
    const g = group(e.date);
    const amount = parseFloat(e.amount.toString());
    g.expensesByCurrency[e.currency] = (g.expensesByCurrency[e.currency] || 0) + amount;
  }

  // Every month of the current year up to now shows even with no data
  // yet, so the table reads as a year-to-date view rather than only
  // showing whichever months happen to have an entry.
  const now = new Date();
  for (let m = 0; m <= now.getMonth(); m++) {
    group(new Date(now.getFullYear(), m, 1));
  }

  const sortedMonths = Array.from(months.values()).sort((a, b) => (a.key > b.key ? 1 : -1));

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("accountSummary", openAlerts.length)}
      content={
        <div className="mx-auto max-w-5xl px-6 py-6">
          <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Account</h1>
          <p className="mb-6 text-sm text-neutral-500">
            Subscription revenue against your own business Expenses, by month. Each currency has
            its own set of columns, kept separate rather than combined.
          </p>

          <AccountSummaryView sortedMonths={sortedMonths} currentYear={now.getFullYear()} />
        </div>
      }
    />
  );
}
