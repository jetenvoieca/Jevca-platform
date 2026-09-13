"use client";

import { useMemo, useState } from "react";
import type { PaymentReceivedRow } from "@/lib/actions/paymentsReceived";

// Date-range filter options (2026-09-13 mockup) — "This month"/quarters/
// "This year"/"Last year"/"All" collapsed into one dropdown rather than
// six separate controls, since only one of them can apply at a time.
// Quarters are calendar quarters (Jan-Mar etc.) of the current year.
const PERIOD_OPTIONS = [
  "All",
  "This month",
  "This year",
  "Last year",
  "Q1 (Jan-Mar)",
  "Q2 (Apr-Jun)",
  "Q3 (Jul-Sep)",
  "Q4 (Oct-Dec)",
] as const;

type Period = (typeof PERIOD_OPTIONS)[number];

const QUARTER_INDEX: Partial<Record<Period, number>> = {
  "Q1 (Jan-Mar)": 0,
  "Q2 (Apr-Jun)": 1,
  "Q3 (Jul-Sep)": 2,
  "Q4 (Oct-Dec)": 3,
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

function inPeriod(dateIso: string, period: Period): boolean {
  if (period === "All") return true;
  const d = new Date(dateIso);
  const now = new Date();
  if (period === "This month") {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  if (period === "This year") return d.getFullYear() === now.getFullYear();
  if (period === "Last year") return d.getFullYear() === now.getFullYear() - 1;
  const q = QUARTER_INDEX[period];
  if (q === undefined) return true;
  return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === q;
}

export default function PaymentsReceivedView({ payments }: { payments: PaymentReceivedRow[] }) {
  const [period, setPeriod] = useState<Period>("All");
  const [paidByFilter, setPaidByFilter] = useState("All");
  const [buyerFilter, setBuyerFilter] = useState("All");

  const paidByOptions = useMemo(
    () => ["All", ...Array.from(new Set(payments.map((p) => p.paidBy))).sort()],
    [payments]
  );
  const buyerOptions = useMemo(
    () => [
      "All",
      ...Array.from(new Set(payments.map((p) => p.buyerName).filter(Boolean) as string[])).sort(),
    ],
    [payments]
  );

  // Currencies actually present, GBP/EUR first (matches the mockup's own
  // column order) then anything else alphabetically — a currency beyond
  // those two just adds its own column rather than needing a code change.
  const currencies = useMemo(() => {
    const present = Array.from(new Set(payments.map((p) => p.currency)));
    const priority = ["GBP", "EUR"];
    return present.sort((a, b) => {
      const ai = priority.indexOf(a);
      const bi = priority.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [payments]);

  const filtered = useMemo(
    () =>
      payments.filter(
        (p) =>
          inPeriod(p.paidAt, period) &&
          (paidByFilter === "All" || p.paidBy === paidByFilter) &&
          (buyerFilter === "All" || p.buyerName === buyerFilter)
      ),
    [payments, period, paidByFilter, buyerFilter]
  );

  const totalsByCurrency = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const p of filtered) {
      totals[p.currency] = (totals[p.currency] || 0) + parseFloat(p.amount);
    }
    return totals;
  }, [filtered]);

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Payments received</h1>
      <p className="mb-4 text-sm text-neutral-500">
        {filtered.length === 0
          ? "No payments received yet."
          : `${filtered.length} payment${filtered.length === 1 ? "" : "s"} received · ${currencies
              .filter((c) => totalsByCurrency[c])
              .map((c) => formatMoney(totalsByCurrency[c], c))
              .join(" · ")}`}
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs"
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select
          value={paidByFilter}
          onChange={(e) => setPaidByFilter(e.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs"
        >
          {paidByOptions.map((o) => (
            <option key={o} value={o}>
              {o === "All" ? "All payment types" : o}
            </option>
          ))}
        </select>
        <select
          value={buyerFilter}
          onChange={(e) => setBuyerFilter(e.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs"
        >
          {buyerOptions.map((o) => (
            <option key={o} value={o}>
              {o === "All" ? "All buyers" : o}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-400">
              <th className="px-3 py-2 font-normal">Date</th>
              <th className="px-3 py-2 font-normal">Buyer</th>
              <th className="px-3 py-2 font-normal">Type</th>
              {currencies.map((c) => (
                <th key={c} className="px-3 py-2 font-normal">
                  Amount ({c})
                </th>
              ))}
              <th className="px-3 py-2 font-normal">Paid by</th>
              <th className="px-3 py-2 font-normal">Artwork</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5 + currencies.length}
                  className="px-3 py-6 text-center text-sm text-neutral-400"
                >
                  Nothing here yet.
                </td>
              </tr>
            )}
            {filtered.map((p) => (
              <tr
                key={p.id}
                className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
              >
                <td className="whitespace-nowrap px-3 py-2 text-neutral-400">
                  {new Date(p.paidAt).toLocaleDateString("en-GB")}
                </td>
                <td className="px-3 py-2 text-neutral-600">{p.buyerName || "—"}</td>
                <td className="px-3 py-2 text-neutral-500">
                  {p.type === "FULL" ? "Full" : "Instalments"}
                </td>
                {currencies.map((c) => (
                  <td key={c} className="whitespace-nowrap px-3 py-2">
                    {p.currency === c ? formatMoney(parseFloat(p.amount), c) : ""}
                  </td>
                ))}
                <td className="px-3 py-2 font-medium text-green-700">{p.paidBy}</td>
                <td className="flex items-center gap-2 px-3 py-2">
                  {p.artworkThumbnail ? (
                    <img
                      src={p.artworkThumbnail}
                      alt=""
                      className="h-8 w-8 rounded object-cover"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded bg-neutral-100" />
                  )}
                  <span className="truncate">{p.artworkTitle}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
