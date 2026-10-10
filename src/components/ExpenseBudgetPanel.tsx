"use client";

import { useMemo } from "react";
import type { PlatformExpenseRow } from "@/lib/actions/platformExpenses";

// Budget on Accounts → Expenses (2026-10-10, direct request — "how much I
// spend each month, how much spent this month and how much more is
// estimated"). Compares last complete month with this month so far, one
// row per supplier. Still expected (Craig's choice): every supplier paid
// last month that hasn't been paid yet this month, at last month's
// amount. Months are Paris calendar months. Kept per currency — amounts
// in different currencies are never added together.

type Row = {
  key: string;
  payee: string;
  category: string;
  currency: string;
  last: number;
  current: number;
};

type Totals = { last: number; current: number; expected: number };

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// "2026-09" → "September 2026".
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );
}

export default function ExpenseBudgetPanel({
  expenses,
  today,
}: {
  expenses: PlatformExpenseRow[];
  today: string; // "YYYY-MM-DD", Paris
}) {
  const thisMonth = today.slice(0, 7);
  const lastMonth = useMemo(() => {
    const [y, m] = thisMonth.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return d.toISOString().slice(0, 7);
  }, [thisMonth]);

  const { rows, totals } = useMemo(() => {
    const byKey = new Map<string, Row>();
    for (const e of expenses) {
      const month = e.date.slice(0, 7);
      if (month !== thisMonth && month !== lastMonth) continue;
      // A supplier's name may be typed slightly differently each time.
      const key = `${e.payeeName.trim().toLowerCase()}|${e.currency}`;
      const row = byKey.get(key) ?? {
        key,
        payee: e.payeeName.trim(),
        category: e.category,
        currency: e.currency,
        last: 0,
        current: 0,
      };
      const amount = parseFloat(e.amount);
      if (month === thisMonth) row.current += amount;
      else row.last += amount;
      byKey.set(key, row);
    }
    const rows = [...byKey.values()].sort(
      (a, b) => a.currency.localeCompare(b.currency) || b.last + b.current - (a.last + a.current)
    );
    const totals: Record<string, Totals> = {};
    for (const r of rows) {
      const t = (totals[r.currency] ??= { last: 0, current: 0, expected: 0 });
      t.last += r.last;
      t.current += r.current;
      if (r.current === 0) t.expected += r.last;
    }
    return { rows, totals };
  }, [expenses, thisMonth, lastMonth]);

  const currencies = Object.keys(totals).sort();
  const lastLabel = monthLabel(lastMonth);
  const thisLabel = monthLabel(thisMonth);

  return (
    <div className="mb-6 rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">
        Budget — {thisLabel} against {lastLabel}
      </h2>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No expenses in {lastLabel} or {thisLabel} yet.</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: `${lastLabel} total`, value: (t: Totals) => t.last },
              { label: "Spent so far", value: (t: Totals) => t.current },
              { label: "Still expected", value: (t: Totals) => t.expected },
              { label: `Estimated ${thisLabel}`, value: (t: Totals) => t.current + t.expected, strong: true },
            ].map((stat) => (
              <div key={stat.label} className="rounded-md border border-neutral-200 bg-white p-3">
                <p className="text-xs text-neutral-500">{stat.label}</p>
                {currencies.map((c) => (
                  <p
                    key={c}
                    className={`text-base ${stat.strong ? "font-semibold text-neutral-900" : "text-neutral-800"}`}
                  >
                    {formatMoney(stat.value(totals[c]), c)}
                  </p>
                ))}
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Paid to</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 text-right font-medium">{lastLabel}</th>
                  <th className="px-3 py-2 text-right font-medium">{thisLabel}</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((r) => {
                  const expected = r.current === 0 && r.last > 0;
                  return (
                    <tr key={r.key}>
                      <td className="px-3 py-2 text-neutral-800">{r.payee}</td>
                      <td className="px-3 py-2 text-neutral-500">{r.category}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-neutral-700">
                        {r.last > 0 ? formatMoney(r.last, r.currency) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-neutral-700">
                        {r.current > 0 ? formatMoney(r.current, r.currency) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">
                        {expected ? (
                          <span className="text-amber-700">Expected</span>
                        ) : r.last === 0 ? (
                          <span className="text-neutral-500">New</span>
                        ) : (
                          <span className="text-green-700">Paid</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-neutral-400">
            Still expected: suppliers paid in {lastLabel} who haven&apos;t been paid yet this month, at
            {" "}{lastLabel}&apos;s amount.
          </p>
        </>
      )}
    </div>
  );
}
