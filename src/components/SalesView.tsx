"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatDate, ukYearMonth } from "@/lib/formatDate";
import { CURRENCIES, type Currency } from "@/lib/currencies";
import { SaleStatusBadge } from "@/components/GallerySaleCard";
import SaleModal, { type SaleModalTarget } from "@/components/SaleModal";
import type { SaleRow } from "@/lib/actions/sales";
import { useClientWords } from "@/components/ClientWordsProvider";

// Sale date periods: all time, this (UK calendar) year, or one quarter
// of this year.
const PERIODS = ["ALL", "YEAR", "Q1", "Q2", "Q3", "Q4"] as const;
type Period = (typeof PERIODS)[number];

const PERIOD_LABEL: Record<Period, string> = {
  ALL: "All time",
  YEAR: "This Year",
  Q1: "Q1",
  Q2: "Q2",
  Q3: "Q3",
  Q4: "Q4",
};

const CURRENCY_SYMBOL: Record<Currency, string> = { GBP: "£", EUR: "€" };

// Which currency's sales are shown: one, or both side by side.
const CURRENCY_VIEWS = ["EUR", "GBP", "BOTH"] as const;
type CurrencyView = (typeof CURRENCY_VIEWS)[number];

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

function inPeriod(sale: SaleRow, period: Period, year: number): boolean {
  if (period === "ALL") return true;
  const date = ukYearMonth(sale.createdAt);
  if (!date || date.year !== year) return false;
  if (period === "YEAR") return true;
  const quarter = Math.ceil(date.month / 3);
  return period === `Q${quarter}`;
}

type Sums = Record<Currency, { amount: number; net: number }>;

function emptySums(): Sums {
  return Object.fromEntries(CURRENCIES.map((c) => [c, { amount: 0, net: 0 }])) as Sums;
}

// One site's Sales list. Clicking a row opens the shared SaleModal —
// the same modal Consolidated Sales and the Inbox use, so a sale looks
// and behaves identically wherever it's opened. Every sale is listed,
// cancelled ones included; amounts sit in one column per currency.
export default function SalesView({
  siteId,
  artistId,
  sales,
}: {
  siteId: string;
  artistId: string;
  sales: SaleRow[];
}) {
  const words = useClientWords();
  const [period, setPeriod] = useState<Period>("YEAR");
  const [currencyView, setCurrencyView] = useState<CurrencyView>("EUR");
  const [target, setTarget] = useState<SaleModalTarget | null>(null);
  const router = useRouter();

  const currentYear = ukYearMonth(new Date())!.year;

  const shownCurrencies: readonly Currency[] = currencyView === "BOTH" ? CURRENCIES : [currencyView];

  const filtered = useMemo(
    () =>
      sales.filter(
        (s) =>
          inPeriod(s, period, currentYear) &&
          (currencyView === "BOTH" || s.currency === currencyView)
      ),
    [sales, period, currentYear, currencyView]
  );

  // Paid / Unpaid / Total per currency. Cancelled sales are listed but
  // not counted.
  const totals = useMemo(() => {
    const paid = emptySums();
    const unpaid = emptySums();
    const total = emptySums();
    for (const s of filtered) {
      if (s.status === "ABANDONED") continue;
      const currency = s.currency as Currency;
      if (!CURRENCIES.includes(currency)) continue;
      const amount = parseFloat(s.totalAmount);
      const net = parseFloat(s.netAmount);
      const bucket = s.status === "COMPLETED" ? paid : unpaid;
      bucket[currency].amount += amount;
      bucket[currency].net += net;
      total[currency].amount += amount;
      total[currency].net += net;
    }
    return [
      { label: "Paid", sums: paid },
      { label: "Unpaid", sums: unpaid },
      { label: "Total", sums: total },
    ];
  }, [filtered]);

  const moneyCell = "px-3 py-1.5 text-right whitespace-nowrap";

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Sales</h1>
      <p className="mb-4 text-sm text-neutral-500">
        {filtered.length} sale{filtered.length === 1 ? "" : "s"}
      </p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                period === p
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-full border border-neutral-300 text-xs">
          {CURRENCY_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setCurrencyView(v)}
              className={`px-3 py-1 font-medium ${
                currencyView === v
                  ? "bg-neutral-900 text-white"
                  : "bg-white text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {v === "BOTH" ? "Both" : v}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-400">
              <th className="px-3 py-2 font-normal">Date</th>
              <th className="px-3 py-2 font-normal">{words.item}</th>
              <th className="px-3 py-2 font-normal">Buyer</th>
              <th className="px-3 py-2 font-normal">Type</th>
              {shownCurrencies.map((c) => (
                <th key={`amount-${c}`} className="px-3 py-2 text-right font-normal">
                  Amount {CURRENCY_SYMBOL[c]}
                </th>
              ))}
              {shownCurrencies.map((c) => (
                <th key={`net-${c}`} className="px-3 py-2 text-right font-normal">
                  Net {CURRENCY_SYMBOL[c]}
                </th>
              ))}
              <th className="px-3 py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5 + shownCurrencies.length * 2}
                  className="px-3 py-6 text-center text-sm text-neutral-400"
                >
                  No sales in this period.
                </td>
              </tr>
            )}
            {filtered.map((s) => (
              <tr
                key={s.purchaseId}
                onClick={() =>
                  setTarget({ purchaseId: s.purchaseId, artworkId: s.artworkId, artistId, siteId })
                }
                className={`cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50 ${
                  target?.purchaseId === s.purchaseId ? "bg-neutral-50" : ""
                }`}
              >
                <td className="px-3 py-1.5 whitespace-nowrap text-neutral-400">
                  {formatDate(s.createdAt)}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex max-w-[16rem] items-center gap-2">
                    {s.artworkThumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.artworkThumbnail}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="h-7 w-7 shrink-0 rounded bg-neutral-100" />
                    )}
                    <span className="truncate">{s.artworkTitle}</span>
                  </div>
                </td>
                <td className="max-w-[12rem] truncate px-3 py-1.5 text-neutral-600">
                  {s.buyerName || s.buyerEmail}
                </td>
                <td className="px-3 py-1.5 text-neutral-500">
                  {s.type === "FULL" ? "Full" : "Instalments"}
                </td>
                {shownCurrencies.map((c) => (
                  <td key={`amount-${c}`} className={moneyCell}>
                    {s.currency === c ? formatMoney(parseFloat(s.totalAmount), c) : ""}
                  </td>
                ))}
                {shownCurrencies.map((c) => (
                  <td key={`net-${c}`} className={moneyCell}>
                    {s.currency === c ? formatMoney(parseFloat(s.netAmount), c) : ""}
                  </td>
                ))}
                <td className="px-3 py-1.5">
                  <SaleStatusBadge status={s.status} overdue={s.overdue} />
                </td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="border-t border-neutral-300 bg-neutral-50">
              {totals.map(({ label, sums }) => (
                <tr
                  key={label}
                  className={label === "Total" ? "font-semibold text-neutral-900" : "text-neutral-600"}
                >
                  <td colSpan={4} className="px-3 py-1.5 text-right">
                    {label}
                  </td>
                  {shownCurrencies.map((c) => (
                    <td key={`amount-${c}`} className={moneyCell}>
                      {formatMoney(sums[c].amount, c)}
                    </td>
                  ))}
                  {shownCurrencies.map((c) => (
                    <td key={`net-${c}`} className={moneyCell}>
                      {formatMoney(sums[c].net, c)}
                    </td>
                  ))}
                  <td />
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>

      {target && (
        <SaleModal
          target={target}
          onClose={() => setTarget(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}
