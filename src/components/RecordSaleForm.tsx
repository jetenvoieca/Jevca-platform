"use client";

import { useState, useTransition } from "react";
import { startGallerySale } from "@/lib/actions/payments";
import type { LocationType } from "@/lib/actions/locations";
import type { ArtworkDetail } from "@/components/ArtworkDetailPanel";
import { netOwed } from "@/lib/saleMath";
import { CURRENCIES, formatMoney } from "@/lib/currencies";
import { ACTION_BUTTON_LOOK } from "@/components/ActionPanel";
import { useClientWords } from "@/components/ClientWordsProvider";

// The blank Record Sale form for a work at a location (Locations page) —
// shown until the work has a sale; after that GallerySaleCard manages
// it. Mounted afresh for each work, so it always starts from that work's
// and location's defaults.

const inputCls = "w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50";
const labelCls = "mb-1 block text-xs text-neutral-500";
const readOnlyCls = "w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm text-neutral-500";

// The VAT a gallery's sale price is taken to include when Remove VAT is
// pressed: the client's own VAT rate (Settings → Financial), or 20% if
// none is set — always shown on the button.
const DEFAULT_VAT_RATE = 20;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default function RecordSaleForm({
  siteId,
  artwork,
  location,
  vatRate,
  onRecorded,
}: {
  siteId: string;
  artwork: ArtworkDetail;
  // The location the work is at — its Customer id, Type, and the
  // defaults it gives the form.
  location: {
    customerId: string;
    type: LocationType | null;
    name: string;
    email: string | null;
    defaultCommissionPercent: string | null;
  };
  // The client's VAT rate (Settings → Financial), null if not set.
  vatRate: number | null;
  onRecorded: () => void;
}) {
  const words = useClientWords();
  const isOwn = location.type === "OWN";
  const isGallery = location.type === "GALLERY";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Defaults to the work's own price, in its own currency (2026-09-03,
  // 2026-10-15) — still editable.
  const [totalAmount, setTotalAmount] = useState(artwork.presentationPrice || "");
  // Two adjustments (2026-10-27, direct request), applied in this order:
  // - Remove VAT (a Gallery's sale only): the price typed includes VAT;
  //   it's taken off first, and the commission applies to what's left.
  // - Currency: the price is typed in the work's own currency
  //   (baseCurrency); choosing another asks for the exchange rate (1 of
  //   the work's = this many of the other), and the sale is recorded —
  //   and invoiced — in that currency.
  // With either used, the work's Catalogue price is left unchanged.
  const baseCurrency = artwork.priceCurrency || "GBP";
  const [currency, setCurrency] = useState(baseCurrency);
  const [vatRemoved, setVatRemoved] = useState(false);
  const [exchangeRate, setExchangeRate] = useState("");
  // A gallery's own default commission, still editable per sale; always
  // 0 for an Own location (2026-09-22).
  const [commission, setCommission] = useState(isOwn ? "0" : location.defaultCommissionPercent || "");
  // Deposit already paid (2026-09-22) — the Own-location counterpart to
  // Commission %: it stands in for it as what reduces Net Due.
  const [depositPaid, setDepositPaid] = useState("");
  // Buyer (2026-09-22): a Gallery location prefills its own contact,
  // still overridable; an Own location starts blank so the artist types
  // the real buyer. See startGallerySale in payments.ts.
  const [buyerName, setBuyerName] = useState(isGallery ? location.name : "");
  const [buyerEmail, setBuyerEmail] = useState(isGallery ? location.email || "" : "");

  // Live figures — the same Net Due formula as everywhere else
  // (lib/saleMath.ts). Price typed → less VAT if removed → in the chosen
  // currency if it isn't the work's → what's recorded (recordedPrice),
  // and Net Due from that, so what's shown is exactly what's recorded
  // and invoiced.
  const shownVatRate = vatRate ?? DEFAULT_VAT_RATE;
  const amount = parseFloat(totalAmount) || 0;
  const vatOff = isGallery && vatRemoved;
  const priceExVat = vatOff ? round2(amount / (1 + shownVatRate / 100)) : amount;
  const converting = currency !== baseCurrency;
  const rate = parseFloat(exchangeRate) || 0;
  // Converted, the net after commission is what's converted (2026-10-27,
  // Craig: the order on the form), so Invoice price is exactly Net Due ×
  // the rate. The price recorded in the new currency is worked back from
  // it — the one that leaves exactly that once the commission is taken
  // (rounding to the penny can't move it, as the commission's share is
  // under 1). With no commission (or 100%) it's simply the price × rate.
  const commissionShare = isOwn ? 0 : (parseFloat(commission) || 0) / 100;
  const netBase = round2(priceExVat - round2(priceExVat * commissionShare));
  const recordedPrice = !converting
    ? priceExVat
    : commissionShare > 0 && commissionShare < 1
      ? round2(round2(netBase * rate) / (1 - commissionShare))
      : round2(priceExVat * rate);
  const netDue = netOwed({ totalAmount: priceExVat, commissionPercent: commission, depositPaid });
  const netInvoiced = netOwed({
    totalAmount: recordedPrice,
    commissionPercent: commission,
    depositPaid: converting ? round2((parseFloat(depositPaid) || 0) * rate) : depositPaid,
  });

  const record = () => {
    if (!totalAmount.trim()) {
      setError("The sale price is required.");
      return;
    }
    if (converting && !(rate > 0)) {
      setError(`Enter the exchange rate from ${baseCurrency} to ${currency}.`);
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("totalAmount", recordedPrice.toFixed(2));
    fd.set("currency", currency);
    if (vatOff || converting) {
      fd.set("keepCataloguePrice", "1");
      // How it was worked out, shown on the sale card (2026-10-27).
      fd.set("priceAsSold", amount.toFixed(2));
      fd.set("currencyAsSold", baseCurrency);
      if (vatOff) fd.set("vatPercentRemoved", String(shownVatRate));
      if (converting) fd.set("exchangeRate", String(rate));
    }
    fd.set("commissionPercent", isOwn ? "0" : commission.trim());
    fd.set("depositPaid", isOwn ? depositPaid.trim() : "");
    fd.set("buyerName", buyerName.trim());
    fd.set("buyerEmail", buyerEmail.trim());
    fd.set("saleDate", saleDate);
    startTransition(async () => {
      const res = await startGallerySale(artwork.id, location.customerId, siteId, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onRecorded();
    });
  };

  return (
    <div className="space-y-3">
      {/* Row 1 (Craig's mockup, 2026-10-27): Date · Sale price in the
          work's currency, with Remove VAT inside it (a Gallery's sale
          only) · Net price — the price net of VAT, or the price itself
          if VAT isn't removed. */}
      <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-3">
        <div>
          <label className={labelCls}>Date</label>
          <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Sale price</label>
          <div className="flex gap-1.5">
            <input
              type="text"
              inputMode="decimal"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              placeholder="e.g. 250.00"
              className={`min-w-0 ${inputCls}`}
            />
            {isGallery && (
              <button
                type="button"
                onClick={() => setVatRemoved((v) => !v)}
                title={
                  vatRate == null
                    ? `Takes off ${shownVatRate}% VAT (no VAT rate in Settings → Financial). Click again to put it back.`
                    : `Takes off ${shownVatRate}% VAT (Settings → Financial). Click again to put it back.`
                }
                className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-1 text-xs ${
                  vatRemoved ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:bg-neutral-50"
                }`}
              >
                {vatRemoved ? "VAT removed" : "Remove VAT"}
              </button>
            )}
          </div>
        </div>
        <div>
          <label className={labelCls}>Net price</label>
          <input
            type="text"
            readOnly
            value={amount ? formatMoney(priceExVat, baseCurrency) : "—"}
            className={readOnlyCls}
          />
        </div>
      </div>

      {/* Row 2: Commission % (Gallery — applied to the Net price) or
          Deposit paid (Own) · Net Due, in the work's currency · GBP|EUR ·
          Invoice price, in the chosen currency. */}
      <div className="grid grid-cols-[1fr_1fr_auto_1fr] items-end gap-3">
        {isOwn ? (
          <div>
            <label className={labelCls}>Deposit paid</label>
            <input
              type="text"
              inputMode="decimal"
              value={depositPaid}
              onChange={(e) => setDepositPaid(e.target.value)}
              placeholder="e.g. 50.00"
              className={inputCls}
            />
          </div>
        ) : (
          <div>
            <label className={labelCls}>Commission %</label>
            <input
              type="text"
              inputMode="decimal"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              placeholder="e.g. 45"
              className={inputCls}
            />
          </div>
        )}
        <div>
          <label className={labelCls}>Net Due</label>
          <input type="text" readOnly value={amount ? formatMoney(netDue, baseCurrency) : "—"} className={readOnlyCls} />
        </div>
        <div className="flex overflow-hidden rounded-md border border-neutral-300">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={`px-2.5 py-1 text-sm ${currency === c ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div>
          <label className={labelCls}>Invoice price</label>
          <input
            type="text"
            readOnly
            value={amount && (!converting || rate > 0) ? formatMoney(netInvoiced, currency) : "—"}
            className={readOnlyCls}
          />
        </div>
      </div>
      {/* Shown once the currency isn't the work's own. */}
      {converting && (
        <div className="flex items-center justify-end gap-2 text-sm text-neutral-600">
          <label htmlFor="sale-rate">Exchange rate: 1 {baseCurrency} =</label>
          <input
            id="sale-rate"
            type="text"
            inputMode="decimal"
            value={exchangeRate}
            onChange={(e) => setExchangeRate(e.target.value)}
            placeholder="e.g. 1.15"
            className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm"
          />
          <span>{currency}</span>
        </div>
      )}

      {/* Row 3: Customer · Customer email (wider) */}
      <div className="grid grid-cols-[2fr_3fr] gap-3">
        <div>
          <label className={labelCls}>Customer</label>
          <input
            type="text"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            placeholder={isOwn ? "Buyer's name" : `Defaults to ${words.location.toLowerCase()} name`}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Customer email</label>
          <input
            type="email"
            value={buyerEmail}
            onChange={(e) => setBuyerEmail(e.target.value)}
            placeholder={isOwn ? "Buyer's email" : `Defaults to ${words.location.toLowerCase()} email`}
            className={inputCls}
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        type="button"
        onClick={record}
        disabled={pending || !totalAmount.trim()}
        className={`mt-3 w-full rounded-md px-3 py-2 ${ACTION_BUTTON_LOOK}`}
      >
        Record Sale
      </button>
    </div>
  );
}
