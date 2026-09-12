"use client";

import { useState, useTransition } from "react";
import { updateGallerySaleAmount, type PurchaseDetail } from "@/lib/actions/payments";

const labelCls = "mb-1 block text-xs text-[#5E5E5E]";
const fieldCls =
  "w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-[#5E5E5E] disabled:opacity-50";

// The "Edit Sale" button + popup (price/currency only), extracted into
// its own component (2026-09-12) rather than copy-pasted into a third
// modal header — it was first built inline in GalleriesView, and was
// about to be duplicated again for the Sales and Consolidated Sales
// pages. A shared component is the actual fix for the "these tables
// don't all work the same way" risk raised alongside this request: one
// place to get the popup, its autosave behaviour, and the ACTIVE-only
// restriction right, used identically everywhere a gallery sale can be
// opened.
//
// Self-contained: returns null entirely unless the purchase handed to it
// is an ACTIVE gallery sale, so callers don't need their own visibility
// check — they can render this unconditionally next to their own Close
// button.
export default function EditSaleButton({
  purchase,
  siteId,
  onChanged,
}: {
  purchase: PurchaseDetail | null | undefined;
  siteId: string;
  // Called after a successful save so the caller can re-fetch whatever
  // it's displaying (same contract as GallerySaleCard's own onChanged).
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [show, setShow] = useState(false);
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [error, setError] = useState<string | null>(null);

  if (!purchase || purchase.channel !== "GALLERY" || purchase.status !== "ACTIVE") {
    return null;
  }

  const open = () => {
    setPrice(purchase.totalAmount);
    setCurrency(purchase.currency);
    setError(null);
    setShow(true);
  };

  // Autosaves a single field — always sends both totalAmount and
  // currency together since updateGallerySaleAmount updates the whole
  // row, using whichever value wasn't just edited.
  const save = (field: "totalAmount" | "currency", value: string) => {
    setError(null);
    const fd = new FormData();
    fd.set("totalAmount", field === "totalAmount" ? value : price);
    fd.set("currency", field === "currency" ? value : currency);
    startTransition(async () => {
      const res = await updateGallerySaleAmount(purchase.id, siteId, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onChanged();
    });
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={open}
        className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
      >
        Edit Sale
      </button>

      {show && (
        <>
          {/* Invisible click-outside layer — closes just the popup, not
              whatever modal it's sitting inside. */}
          <div className="fixed inset-0 z-40" onClick={() => setShow(false)} />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-full z-50 mt-1 w-64 rounded-md border border-neutral-200 bg-[#F9F6EE] p-3 shadow-lg"
          >
            <p className="mb-2 text-xs font-semibold text-[#5E5E5E]">Edit Sale</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Price</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  onBlur={(e) => save("totalAmount", e.target.value.trim())}
                  disabled={isPending}
                  className={fieldCls}
                />
              </div>
              <div>
                <label className={labelCls}>Currency</label>
                <select
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value);
                    save("currency", e.target.value);
                  }}
                  disabled={isPending}
                  className={fieldCls}
                >
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </div>
        </>
      )}
    </div>
  );
}
