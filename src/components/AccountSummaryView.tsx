"use client";

import React, { useMemo, useState } from "react";

type MonthRow = {
  key: string;
  label: string;
  salesByCurrency: Record<string, number>;
  expensesByCurrency: Record<string, number>;
};

type Period = "all" | "thisYear" | "Q1" | "Q2" | "Q3" | "Q4";

// Same quarter definitions as AccountsPeriodView (Subscriptions page) —
// always this year's quarters, no separate year picker.
const QUARTER_MONTHS: Record<"Q1" | "Q2" | "Q3" | "Q4", [number, number]> = {
  Q1: [1, 3],
  Q2: [4, 6],
  Q3: [7, 9],
  Q4: [10, 12],
};

// GBP first if present (the platform's default currency), everything
// else alphabetical after it — keeps column order stable and puts the
// currency you'll look at most often on the left.
function orderCurrencies(currencies: Iterable<string>): string[] {
  const set = new Set(currencies);
  const rest = [...set].filter((c) => c !== "GBP").sort();
  return set.has("GBP") ? ["GBP", ...rest] : rest;
}

function fmt(n: number | undefined): string {
  return n === undefined ? "—" : n.toFixed(2);
}

export default function AccountSummaryView({
  sortedMonths,
  currentYear,
}: {
  sortedMonths: MonthRow[];
  currentYear: number;
}) {
  const [period, setPeriod] = useState<Period>("all");

  // Currency columns come from the full dataset, not just the filtered
  // months — so the table's shape doesn't jump around as the period
  // filter changes (2026-08-28).
  const currencies = useMemo(() => {
    const all = new Set<string>();
    for (const m of sortedMonths) {
      Object.keys(m.salesByCurrency).forEach((c) => all.add(c));
      Object.keys(m.expensesByCurrency).forEach((c) => all.add(c));
    }
    return orderCurrencies(all);
  }, [sortedMonths]);

  const filteredMonths = useMemo(() => {
    if (period === "all") return sortedMonths;
    return sortedMonths.filter((g) => {
      const [yearStr, monthStr] = g.key.split("-");
      const year = Number(yearStr);
      if (year !== currentYear) return false;
      if (period === "thisYear") return true;
      const month = Number(monthStr);
      const [start, end] = QUARTER_MONTHS[period];
      return month >= start && month <= end;
    });
  }, [sortedMonths, period, currentYear]);

  const totals = useMemo(() => {
    const sales: Record<string, number> = {};
    const expenses: Record<string, number> = {};
    for (const g of filteredMonths) {
      for (const [c, v] of Object.entries(g.salesByCurrency)) sales[c] = (sales[c] || 0) + v;
      for (const [c, v] of Object.entries(g.expensesByCurrency)) {
        expenses[c] = (expenses[c] || 0) + v;
      }
    }
    return { sales, expenses };
  }, [filteredMonths]);

  const periods: { value: Period; label: string }[] = [
    { value: "all", label: "All time" },
    { value: "thisYear", label: "This Year" },
    { value: "Q1", label: "Q1" },
    { value: "Q2", label: "Q2" },
    { value: "Q3", label: "Q3" },
    { value: "Q4", label: "Q4" },
  ];

  function netCell(sales: Record<string, number>, expenses: Record<string, number>, c: string) {
    if (sales[c] === undefined && expenses[c] === undefined) return "—";
    return ((sales[c] || 0) - (expenses[c] || 0)).toFixed(2);
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-1.5">
        {periods.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPeriod(p.value)}
            className={`rounded-full border px-3 py-1 text-xs ${
              period === p.value
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {filteredMonths.length === 0 ? (
        <p className="text-sm text-neutral-500">No activity in this period.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th rowSpan={2} className="whitespace-nowrap px-4 py-2 align-bottom font-medium">
                  {" "}
                </th>
                {currencies.map((c) => (
                  <th
                    key={c}
                    colSpan={3}
                    className="border-l border-neutral-200 px-4 py-1 text-center font-semibold text-neutral-700"
                  >
                    {c}
                  </th>
                ))}
              </tr>
              <tr>
                {currencies.map((c) => (
                  <React.Fragment key={c}>
                    <th className="border-l border-neutral-200 px-4 py-1.5 font-medium">Sales</th>
                    <th className="px-4 py-1.5 font-medium">Expenses</th>
                    <th className="px-4 py-1.5 font-medium">Net</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredMonths.map((g) => (
                <tr key={g.key}>
                  <td className="whitespace-nowrap px-4 py-2 text-neutral-700">{g.label}</td>
                  {currencies.map((c) => (
                    <React.Fragment key={c}>
                      <td className="border-l border-neutral-100 px-4 py-2 text-neutral-900">
                        {fmt(g.salesByCurrency[c])}
                      </td>
                      <td className="px-4 py-2 text-neutral-900">{fmt(g.expensesByCurrency[c])}</td>
                      <td className="px-4 py-2 text-neutral-900">
                        {netCell(g.salesByCurrency, g.expensesByCurrency, c)}
                      </td>
                    </React.Fragment>
                  ))}
                </tr>
              ))}
              <tr className="bg-neutral-50 font-medium">
                <td className="whitespace-nowrap px-4 py-2 text-neutral-900">
                  {period === "all" ? "Total" : periods.find((p) => p.value === period)!.label + " total"}
                </td>
                {currencies.map((c) => (
                  <React.Fragment key={c}>
                    <td className="border-l border-neutral-200 px-4 py-2 text-neutral-900">
                      {fmt(totals.sales[c])}
                    </td>
                    <td className="px-4 py-2 text-neutral-900">{fmt(totals.expenses[c])}</td>
                    <td className="px-4 py-2 text-neutral-900">
                      {netCell(totals.sales, totals.expenses, c)}
                    </td>
                  </React.Fragment>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
