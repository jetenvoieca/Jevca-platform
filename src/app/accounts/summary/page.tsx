import AppShell from "@/components/AppShell";
import { db } from "@/lib/db";
import { getOpenAlerts } from "@/lib/alerts";
import { buildTopNavItems } from "@/lib/topNav";

export const dynamic = "force-dynamic";

type MonthRow = {
  key: string;
  label: string;
  salesByCurrency: Record<string, number>;
  expensesByCurrency: Record<string, number>;
};

// Kept separate per currency rather than combined into one number, same
// principle used everywhere else on the Accounts pages — converting
// between currencies silently would misrepresent the actual balance.
function formatCurrencyMap(m: Record<string, number>): string {
  const entries = Object.entries(m);
  if (entries.length === 0) return "—";
  return entries.map(([currency, total]) => `${currency} ${total.toFixed(2)}`).join(" · ");
}

function netByCurrency(
  sales: Record<string, number>,
  expenses: Record<string, number>
): Record<string, number> {
  const currencies = new Set([...Object.keys(sales), ...Object.keys(expenses)]);
  const net: Record<string, number> = {};
  for (const c of currencies) {
    net[c] = (sales[c] || 0) - (expenses[c] || 0);
  }
  return net;
}

// The simple platform-level balance view (2026-08-28) — Sales here means
// the platform's own subscription revenue (same source as the
// Subscriptions page), against the platform's own Expenses, by month.
// Deliberately not the same thing as Consolidated Sales, which is every
// artist's sales to their own buyers — this page is specifically the
// owner's own P&L, not artists' activity.
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
  // showing whichever months happen to have an entry (2026-08-28,
  // matching the requested mockup).
  const now = new Date();
  for (let m = 0; m <= now.getMonth(); m++) {
    group(new Date(now.getFullYear(), m, 1));
  }

  const sortedMonths = Array.from(months.values()).sort((a, b) => (a.key > b.key ? 1 : -1));

  const totalSales: Record<string, number> = {};
  const totalExpenses: Record<string, number> = {};
  for (const g of sortedMonths) {
    for (const [c, v] of Object.entries(g.salesByCurrency)) {
      totalSales[c] = (totalSales[c] || 0) + v;
    }
    for (const [c, v] of Object.entries(g.expensesByCurrency)) {
      totalExpenses[c] = (totalExpenses[c] || 0) + v;
    }
  }

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("accountSummary", openAlerts.length)}
      content={
        <div className="mx-auto max-w-2xl px-6 py-6">
          <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Account</h1>
          <p className="mb-6 text-sm text-neutral-500">
            Subscription revenue against your own business Expenses, by month. Amounts are kept
            separate per currency rather than combined.
          </p>

          <div className="overflow-hidden rounded-md border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-medium"></th>
                  <th className="px-4 py-2 font-medium">Sales</th>
                  <th className="px-4 py-2 font-medium">Expenses</th>
                  <th className="px-4 py-2 font-medium">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {sortedMonths.map((g) => (
                  <tr key={g.key}>
                    <td className="whitespace-nowrap px-4 py-2 text-neutral-700">{g.label}</td>
                    <td className="px-4 py-2 text-neutral-900">
                      {formatCurrencyMap(g.salesByCurrency)}
                    </td>
                    <td className="px-4 py-2 text-neutral-900">
                      {formatCurrencyMap(g.expensesByCurrency)}
                    </td>
                    <td className="px-4 py-2 text-neutral-900">
                      {formatCurrencyMap(netByCurrency(g.salesByCurrency, g.expensesByCurrency))}
                    </td>
                  </tr>
                ))}
                <tr className="bg-neutral-50 font-medium">
                  <td className="px-4 py-2 text-neutral-900">Total</td>
                  <td className="px-4 py-2 text-neutral-900">{formatCurrencyMap(totalSales)}</td>
                  <td className="px-4 py-2 text-neutral-900">
                    {formatCurrencyMap(totalExpenses)}
                  </td>
                  <td className="px-4 py-2 text-neutral-900">
                    {formatCurrencyMap(netByCurrency(totalSales, totalExpenses))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      }
    />
  );
}
