"use client";

import { Fragment, useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDate, ukYearMonth } from "@/lib/formatDate";
import { CURRENCIES, type Currency, formatMoney } from "@/lib/currencies";
import { SaleStatusBadge } from "@/components/GallerySaleCard";
import SaleModal, { type SaleModalTarget } from "@/components/SaleModal";
import { attachSaleToLocation, type SaleRow } from "@/lib/actions/sales";
import { createLocation } from "@/lib/actions/locations";
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

function inPeriod(sale: SaleRow, period: Period, year: number): boolean {
  if (period === "ALL") return true;
  const date = ukYearMonth(sale.createdAt);
  if (!date || date.year !== year) return false;
  if (period === "YEAR") return true;
  const quarter = Math.ceil(date.month / 3);
  return period === `Q${quarter}`;
}

// The "Attach to…" choice's "+ Add new…" option — never a customer id.
const ADD_NEW = "__add_new__";

type Sums = Record<Currency, { amount: number; net: number }>;

function emptySums(): Sums {
  return Object.fromEntries(CURRENCIES.map((c) => [c, { amount: 0, net: 0 }])) as Sums;
}

// One site's Sales list. Clicking a row opens the shared SaleModal —
// the same modal Consolidated Sales and the Inbox use, so a sale looks
// and behaves identically wherever it's opened. Every sale is listed,
// cancelled ones included; amounts sit in one column per currency. A
// sale with no customer (e.g. its location was deleted) can be attached
// to a location from its Location cell (2026-11-10).
export default function SalesView({
  siteId,
  artistId,
  sales,
  locations,
}: {
  siteId: string;
  artistId: string;
  sales: SaleRow[];
  // The artist's Locations, for "Attach to…".
  locations: { customerId: string; name: string }[];
}) {
  const words = useClientWords();
  const [period, setPeriod] = useState<Period>("YEAR");
  const [currencyView, setCurrencyView] = useState<CurrencyView>("EUR");
  const [target, setTarget] = useState<SaleModalTarget | null>(null);
  const router = useRouter();
  const [attaching, startAttach] = useTransition();

  // Attach a sale to the location chosen — or to a new one, named and
  // typed the same way as the Artwork Catalogue's Location "+ Add new…".
  const attach = (purchaseId: string, choice: string) => {
    if (!choice) return;
    startAttach(async () => {
      let customerId = choice;
      if (choice === ADD_NEW) {
        const name = window.prompt(`Add a new ${words.location}:`)?.trim();
        if (!name) return;
        const isGallery = window.confirm(
          `Is "${name}" a ${words.location} you consign to?\n\nOK = ${words.location}\nCancel = Own (e.g. your studio)`
        );
        const created = await createLocation(artistId, siteId, name, isGallery ? "GALLERY" : "OWN");
        if ("error" in created) {
          alert(created.error);
          return;
        }
        customerId = created.customerId;
      }
      const result = await attachSaleToLocation(purchaseId, customerId);
      if ("error" in result) alert(result.error);
      router.refresh();
    });
  };

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
              <th className="px-3 py-2 font-normal">Location</th>
              <th className="px-3 py-2 font-normal">Type</th>
              {/* Each currency's amount and net side by side (2026-11-05). */}
              {shownCurrencies.map((c) => (
                <Fragment key={c}>
                  <th className="px-3 py-2 text-right font-normal">Amount {CURRENCY_SYMBOL[c]}</th>
                  <th className="px-3 py-2 text-right font-normal">Net {CURRENCY_SYMBOL[c]}</th>
                </Fragment>
              ))}
              <th className="px-3 py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6 + shownCurrencies.length * 2}
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
                <td className="max-w-[12rem] truncate px-3 py-1.5 text-neutral-600" onClick={(e) => s.canAttach && e.stopPropagation()}>
                  {s.location ??
                    (s.canAttach && (
                      <select
                        value=""
                        disabled={attaching}
                        onChange={(e) => attach(s.purchaseId, e.target.value)}
                        className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs text-neutral-600"
                      >
                        <option value="">Attach to…</option>
                        {locations.map((l) => (
                          <option key={l.customerId} value={l.customerId}>
                            {l.name}
                          </option>
                        ))}
                        <option value={ADD_NEW}>+ Add new…</option>
                      </select>
                    ))}
                </td>
                <td className="px-3 py-1.5 text-neutral-500">
                  {s.type === "FULL" ? "Full" : "Instalments"}
                </td>
                {shownCurrencies.map((c) => (
                  <Fragment key={c}>
                    <td className={moneyCell}>{s.currency === c ? formatMoney(parseFloat(s.totalAmount), c) : ""}</td>
                    <td className={moneyCell}>{s.currency === c ? formatMoney(parseFloat(s.netAmount), c) : ""}</td>
                  </Fragment>
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
                  <td colSpan={5} className="px-3 py-1.5 text-right">
                    {label}
                  </td>
                  {shownCurrencies.map((c) => (
                    <Fragment key={c}>
                      <td className={moneyCell}>{formatMoney(sums[c].amount, c)}</td>
                      <td className={moneyCell}>{formatMoney(sums[c].net, c)}</td>
                    </Fragment>
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
