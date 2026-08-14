import Link from "next/link";
import AppShell from "@/components/AppShell";
import { db } from "@/lib/db";
import { getOpenAlerts } from "@/lib/alerts";
import { buildTopNavItems } from "@/lib/topNav";

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

  const grandTotalsByCurrency: Record<string, number> = {};
  for (const g of sortedMonths) {
    for (const [currency, total] of Object.entries(g.totalsByCurrency)) {
      grandTotalsByCurrency[currency] = (grandTotalsByCurrency[currency] || 0) + total;
    }
  }

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

          {sortedMonths.length === 0 ? (
            <p className="text-sm text-neutral-500">No subscription payments recorded yet.</p>
          ) : (
            <>
              <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  All-time total
                </p>
                <p className="text-lg font-semibold text-neutral-900">
                  {Object.entries(grandTotalsByCurrency)
                    .map(([currency, total]) => `${currency} ${total.toFixed(2)}`)
                    .join("  ·  ")}
                </p>
              </div>

              <div className="space-y-3">
                {sortedMonths.map((g) => (
                  <details
                    key={g.key}
                    className="group rounded-lg border border-neutral-200 bg-white"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
                      <span className="text-sm font-medium text-neutral-900">{g.label}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-sm text-neutral-600">
                          {Object.entries(g.totalsByCurrency)
                            .map(([currency, total]) => `${currency} ${total.toFixed(2)}`)
                            .join("  ·  ")}
                        </span>
                        <span className="text-xs text-neutral-400">
                          {g.rows.length} payment{g.rows.length === 1 ? "" : "s"}
                        </span>
                      </span>
                    </summary>
                    <table className="w-full border-t border-neutral-100 text-xs">
                      <thead className="bg-neutral-50 text-left text-neutral-400">
                        <tr>
                          <th className="px-4 py-1.5 font-medium">Artist</th>
                          <th className="px-4 py-1.5 font-medium">Date</th>
                          <th className="px-4 py-1.5 font-medium">Amount</th>
                          <th className="px-4 py-1.5 font-medium">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r, i) => (
                          <tr key={i} className="border-t border-neutral-100">
                            <td className="px-4 py-1.5">{r.artistName}</td>
                            <td className="px-4 py-1.5">
                              {r.paidAt.toLocaleDateString("en-GB")}
                            </td>
                            <td className="px-4 py-1.5">
                              {r.currency} {r.amount.toFixed(2)}
                            </td>
                            <td className="px-4 py-1.5 text-neutral-400">
                              {r.source === "STRIPE"
                                ? "Stripe"
                                : r.paymentMethod === "DD"
                                  ? "Direct Debit"
                                  : r.paymentMethod || "Manual"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                ))}
              </div>
            </>
          )}
        </div>
      }
    />
  );
}
