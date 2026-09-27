import AppShell from "@/components/AppShell";
import { db } from "@/lib/db";
import { getOpenAlerts } from "@/lib/alerts";
import { buildTopNavItems } from "@/lib/topNav";
import { buildAccountMonths } from "@/lib/accountMonths";
import AccountSummaryView from "@/components/AccountSummaryView";

export const dynamic = "force-dynamic";

// The simple platform-level balance view (2026-08-28) — Sales here means
// the platform's own subscription revenue (same source as the
// Subscriptions page), against the platform's own Expenses, by month.
// Deliberately not the same thing as Consolidated Sales, which is every
// artist's sales to their own buyers — this page is specifically the
// owner's own P&L, not artists' activity.
//
// Month grouping is shared with each artist's own Account page
// (/sites/[id]/account) via buildAccountMonths (2026-09-27).
export default async function AccountSummaryPage() {
  const [payments, expenses, openAlerts] = await Promise.all([
    db.subscriptionPayment.findMany({ select: { amount: true, currency: true, paidAt: true } }),
    db.platformExpense.findMany({ select: { amount: true, currency: true, date: true } }),
    getOpenAlerts(),
  ]);

  const now = new Date();
  const sortedMonths = buildAccountMonths(
    payments.map((p) => ({ amount: p.amount, currency: p.currency, date: p.paidAt })),
    expenses,
    now
  );

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
