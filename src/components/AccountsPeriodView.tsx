"use client";

import { useMemo, useState } from "react";

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

type Period = "all" | "thisYear" | "Q1" | "Q2" | "Q3" | "Q4";

// Calendar quarters (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec) of the current
// year specifically — there's no separate year picker here (not asked
// for), so Q1–Q4 are always "this year's" quarter, same as "This Year"
// is always the current one. Re-check if a year selector is ever wanted
// alongside these.
const QUARTER_MONTHS: Record<"Q1" | "Q2" | "Q3" | "Q4", [number, number]> = {
  Q1: [1, 3],
  Q2: [4, 6],
  Q3: [7, 9],
  Q4: [10, 12],
};

export default function AccountsPeriodView({
  sortedMonths,
  currentYear,
}: {
  sortedMonths: MonthGroup[];
  // Passed from the server (2026-08-18) rather than computed with
  // `new Date()` here — keeps "this year" tied to the server's clock,
  // not whatever the browser's local clock happens to say.
  currentYear: number;
}) {
  const [period, setPeriod] = useState<Period>("all");

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

  const totalsByCurrency = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const g of filteredMonths) {
      for (const [currency, total] of Object.entries(g.totalsByCurrency)) {
        totals[currency] = (totals[currency] || 0) + total;
      }
    }
    return totals;
  }, [filteredMonths]);

  const periods: { value: Period; label: string }[] = [
    { value: "all", label: "All time" },
    { value: "thisYear", label: "This Year" },
    { value: "Q1", label: "Q1" },
    { value: "Q2", label: "Q2" },
    { value: "Q3", label: "Q3" },
    { value: "Q4", label: "Q4" },
  ];

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
        <p className="text-sm text-neutral-500">No subscription payments in this period.</p>
      ) : (
        <>
          <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {period === "all"
                ? "All-time total"
                : periods.find((p) => p.value === period)!.label + " total"}
            </p>
            <p className="text-lg font-semibold text-neutral-900">
              {Object.entries(totalsByCurrency)
                .map(([currency, total]) => `${currency} ${total.toFixed(2)}`)
                .join("  ·  ")}
            </p>
          </div>

          <div className="space-y-3">
            {filteredMonths.map((g) => (
              <details key={g.key} className="group rounded-lg border border-neutral-200 bg-white">
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
                <table className="w-full table-fixed border-t border-neutral-100 text-xs">
                  <thead className="bg-neutral-50 text-left text-neutral-400">
                    <tr>
                      <th className="w-[38%] px-4 py-1.5 font-medium">Artist</th>
                      <th className="w-[20%] px-4 py-1.5 font-medium">Date</th>
                      <th className="w-[22%] px-4 py-1.5 font-medium">Amount</th>
                      <th className="w-[20%] px-4 py-1.5 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r, i) => (
                      <tr key={i} className="border-t border-neutral-100">
                        <td className="truncate px-4 py-1.5">{r.artistName}</td>
                        <td className="px-4 py-1.5">
                          {new Date(r.paidAt).toLocaleDateString("en-GB")}
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
    </>
  );
}
