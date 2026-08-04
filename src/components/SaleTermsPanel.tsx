"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSaleTerms, type SaleTermsDetail } from "@/lib/actions/payments";

const CURRENCIES = ["GBP", "EUR"];

function formatMoney(amount: string, currency: string) {
  const n = parseFloat(amount);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
}

export default function SaleTermsPanel({
  artworkId,
  siteId,
  siteDefaultCurrency,
  terms,
  // What the customer sees on the public site — used only as the
  // starting value the first time Sale Terms is set up (no terms saved
  // yet). Once terms exist, this is never consulted again, so the price
  // here can always be discounted or otherwise adjusted for a specific
  // sale without Presentation's price fighting back on the next save.
  presentationPrice,
  defaults,
}: {
  artworkId: string;
  siteId: string;
  siteDefaultCurrency: string;
  terms: SaleTermsDetail | null;
  presentationPrice: string | null;
  defaults: {
    defaultInstalmentCount: number;
    defaultReleaseMessage: string;
    defaultReleaseTriggerCount: number;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  // Calculated, not stored — always Total ÷ Number of instalments, kept in
  // sync with whatever's currently typed rather than editable separately.
  const [liveTotal, setLiveTotal] = useState(terms?.totalAmount ?? presentationPrice ?? "");
  const [liveCount, setLiveCount] = useState(terms?.instalmentCount ?? defaults.defaultInstalmentCount);
  const instalmentPrice = (() => {
    const t = parseFloat(liveTotal);
    const c = Number(liveCount);
    if (!t || !c) return "";
    return (t / c).toFixed(2);
  })();

  const handleSaveTerms = (formData: FormData) => {
    startTransition(async () => {
      await saveSaleTerms(artworkId, siteId, formData);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });
  };

  return (
    <div>
      <p className="mb-3 text-xs text-neutral-400">
        What this artwork sells for — nothing here is tied to any particular buyer. Set this up
        first, then use the Payment tab to actually take a sale.
      </p>
      <form action={handleSaveTerms} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Total price</label>
            <input
              type="text"
              name="totalAmount"
              defaultValue={terms?.totalAmount ?? presentationPrice ?? ""}
              onChange={(e) => setLiveTotal(e.target.value)}
              required
              placeholder="e.g. 1200.00"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            {!terms && presentationPrice && (
              <p className="mt-1 text-xs text-neutral-400">
                Starts at Presentation&apos;s price — change it here for a discount or different
                sale price, without affecting what customers see.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Instalment price
            </label>
            <input
              type="text"
              readOnly
              value={instalmentPrice ? formatMoney(instalmentPrice, terms?.currency ?? siteDefaultCurrency) : "—"}
              className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Number of instalments
            </label>
            <input
              type="number"
              name="instalmentCount"
              min={1}
              defaultValue={terms?.instalmentCount ?? defaults.defaultInstalmentCount}
              onChange={(e) => setLiveCount(parseInt(e.target.value || "0", 10))}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-neutral-400">
              Offered as an option — a buyer can still choose to pay in full instead.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Release after
            </label>
            <input
              type="number"
              name="releaseTriggerCount"
              min={1}
              defaultValue={terms?.releaseTriggerCount ?? defaults.defaultReleaseTriggerCount}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-neutral-400">payments</p>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Release message
          </label>
          <textarea
            name="releaseMessage"
            defaultValue={terms?.releaseMessage ?? defaults.defaultReleaseMessage}
            rows={2}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Currency</label>
          <select
            name="currency"
            defaultValue={terms?.currency ?? siteDefaultCurrency}
            className="w-full max-w-[calc(50%-0.5rem)] rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            Save terms
          </button>
          {saved && <span className="text-sm text-green-600">Saved</span>}
        </div>
      </form>
    </div>
  );
}
