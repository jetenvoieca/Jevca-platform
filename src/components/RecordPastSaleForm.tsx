"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordPastSale } from "@/lib/actions/payments";
import CustomerPicker from "@/components/CustomerPicker";
import type { CustomerSummary } from "@/lib/actions/customers";

// Same list as Presentation/Gallery's Currency fields — kept in sync
// deliberately, since these all need to offer identical currency choices.
const CURRENCIES = ["GBP", "EUR"];

function formatMoney(amount: string, currency: string) {
  const n = parseFloat(amount);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
}

// Extracted out of PurchasePanel and promoted to its own top-level tab
// (2026-08-16) — previously this was one of three tabs nested inside
// Payment, and the whole "Start a sale" block it lived in only rendered
// once Sale Terms existed (i.e. a Presentation price had been set). That
// made no sense for a past/offline sale, which takes its own typed price
// and was never going to use Sale Terms or Stripe at all — it just meant
// an unrelated setup step was blocking a simple "record what already
// happened" action. This form has never depended on Sale Terms and now
// doesn't pretend to.
export default function RecordPastSaleForm({
  artworkId,
  artistId,
  siteId,
  saleSources = [],
  defaultCurrency = "GBP",
  onChanged,
}: {
  artworkId: string;
  artistId: string;
  siteId: string;
  saleSources?: string[];
  defaultCurrency?: string;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("");
  const [saleCurrency, setSaleCurrency] = useState(defaultCurrency);
  // Set only when a CustomerPicker result is actually clicked — see the
  // matching note in PurchasePanel for why this has to be authoritative
  // rather than re-matched by email (2026-08-16).
  const [customerId, setCustomerId] = useState<string | null>(null);

  const salePriceNum = parseFloat(salePrice) || 0;
  const commissionNum = parseFloat(commissionPercent) || 0;
  const net = salePriceNum - salePriceNum * (commissionNum / 100);

  const handleSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await recordPastSale(artworkId, siteId, formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBuyerName("");
      setBuyerEmail("");
      setBuyerAddress("");
      setSalePrice("");
      setCommissionPercent("");
      setCustomerId(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      if (onChanged) onChanged();
      else router.refresh();
    });
  };

  return (
    <div className="max-w-xl">
      <p className="mb-4 text-xs text-neutral-400">
        For sales that already happened — outside this app, before it existed, or otherwise not
        taken through Stripe or a live Gallery sale here. No card is taken and nothing is left
        owing: this records it as fully paid straight away, backdated to when it actually sold,
        and marks the artwork Sold.
      </p>
      <form action={handleSubmit} className="space-y-4">
        <div>
          <CustomerPicker
            artistId={artistId}
            onSelect={(c: CustomerSummary) => {
              setBuyerName(c.name);
              setBuyerEmail(c.email || "");
              setBuyerAddress(c.address || "");
              setCustomerId(c.id);
            }}
          />
        </div>
        <input type="hidden" name="customerId" value={customerId ?? ""} />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Buyer / gallery name
            </label>
            <input
              type="text"
              name="buyerName"
              required
              value={buyerName}
              onChange={(e) => {
                setBuyerName(e.target.value);
                setCustomerId(null);
              }}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Email <span className="font-normal text-neutral-400">(optional)</span>
            </label>
            <input
              type="email"
              name="buyerEmail"
              value={buyerEmail}
              onChange={(e) => {
                setBuyerEmail(e.target.value);
                setCustomerId(null);
              }}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Address <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <textarea
            name="buyerAddress"
            rows={2}
            value={buyerAddress}
            onChange={(e) => setBuyerAddress(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        {/* Was a single grid-cols-5 row (Sale price / Currency /
            Commission / Net received / Date) — too cramped to read at
            this panel's width. Split into three clearly paired rows
            instead, matching the two-column pattern already used above
            for Buyer name/Email (2026-08-16). */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Sale price
            </label>
            <input
              type="text"
              name="totalAmount"
              required
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder="e.g. 250.00"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Currency</label>
            <select
              name="currency"
              value={saleCurrency}
              onChange={(e) => setSaleCurrency(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Commission % <span className="font-normal text-neutral-400">(if any)</span>
            </label>
            <input
              type="text"
              name="commissionPercent"
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(e.target.value)}
              placeholder="e.g. 45"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Net received
            </label>
            <input
              type="text"
              readOnly
              value={salePriceNum ? formatMoney(net.toFixed(2), saleCurrency) : "—"}
              className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Date it sold
            </label>
            <input
              type="date"
              name="saleDate"
              required
              max={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Sale source
            </label>
            <select
              name="source"
              defaultValue=""
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">— Not set (defaults to &quot;Historical&quot;) —</option>
              {saleSources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            Record sale
          </button>
          {saved && <span className="text-sm text-green-600">Recorded</span>}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
