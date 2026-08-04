"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  startPurchase,
  startGallerySale,
  markGallerySalePaid,
  updatePurchaseRelease,
  abandonPurchase,
  createPaymentLink,
  createCardEntryIntent,
  type SaleTermsDetail,
  type PurchaseDetail,
} from "@/lib/actions/payments";
import StripeCardForm from "@/components/StripeCardForm";

function formatMoney(amount: string, currency: string) {
  const n = parseFloat(amount);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
}

// Opens the generated PDF in a new tab/download — a plain onClick +
// window.open rather than a raw <a href> or next/link's <Link> (which is
// for in-app navigation, not hitting an API route that returns a file).
function downloadInvoice(purchaseId: string) {
  window.open(`/api/invoice/${purchaseId}`, "_blank");
}

export default function PurchasePanel({
  artworkId,
  siteId,
  terms,
  activePurchase,
  history,
  saleSources = [],
  onChanged,
}: {
  artworkId: string;
  siteId: string;
  terms: SaleTermsDetail | null;
  activePurchase: PurchaseDetail | null;
  history: PurchaseDetail[];
  saleSources?: string[];
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [cardSecret, setCardSecret] = useState<string | null>(null);
  const [purchaseType, setPurchaseType] = useState<"FULL" | "INSTALMENTS">("FULL");
  const [channel, setChannel] = useState<"STRIPE" | "GALLERY">("STRIPE");
  const [commissionPercent, setCommissionPercent] = useState("");
  const [gallerySalePrice, setGallerySalePrice] = useState("");

  const handleSaveRelease = (formData: FormData) => {
    if (!activePurchase) return;
    startTransition(async () => {
      await updatePurchaseRelease(activePurchase.id, siteId, formData);
      setSaved(true);
      router.refresh();
      onChanged?.();
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const handleStartPurchase = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await startPurchase(artworkId, siteId, formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      onChanged?.();
    });
  };

  const handleStartGallerySale = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await startGallerySale(artworkId, siteId, formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      onChanged?.();
    });
  };

  const handleMarkPaid = () => {
    if (!activePurchase) return;
    if (!confirm("Mark this sale as paid? Only do this once the gallery has actually paid.")) return;
    setError(null);
    startTransition(async () => {
      const res = await markGallerySalePaid(activePurchase.id, siteId);
      if (!res.ok) setError(res.error);
      router.refresh();
      onChanged?.();
    });
  };

  const handleAbandon = () => {
    if (!activePurchase) return;
    if (!confirm("Cancel this sale? It'll be kept in the history below, marked as abandoned."))
      return;
    setError(null);
    startTransition(async () => {
      const res = await abandonPurchase(activePurchase.id, siteId);
      if (!res.ok) setError(res.error);
      router.refresh();
      onChanged?.();
    });
  };

  const handleGetLink = () => {
    if (!activePurchase) return;
    setError(null);
    setLinkUrl(null);
    startTransition(async () => {
      const result = await createPaymentLink(activePurchase.id, siteId, artworkId);
      if (result.ok) {
        setLinkUrl(result.url);
      } else {
        setError(result.error);
      }
    });
  };

  const handleEnterCard = () => {
    if (!activePurchase) return;
    setError(null);
    setCardSecret(null);
    startTransition(async () => {
      const result = await createCardEntryIntent(activePurchase.id, siteId);
      if (result.ok) {
        setCardSecret(result.clientSecret);
      } else {
        setError(result.error);
      }
    });
  };

  const paidCount = activePurchase?.payments.filter((p) => p.status === "PAID").length ?? 0;
  const releaseReached =
    !!activePurchase?.releaseTriggerCount && paidCount >= activePurchase.releaseTriggerCount;

  const gallerySalePriceNum = parseFloat(gallerySalePrice) || 0;
  const commissionNum = parseFloat(commissionPercent) || 0;
  const galleryNet = gallerySalePriceNum - gallerySalePriceNum * (commissionNum / 100);

  return (
    <div className="space-y-6">
      {!terms && (
        <p className="text-sm text-neutral-400">
          Set sale terms (on the Sale Terms tab) before starting a sale.
        </p>
      )}

      {terms && !activePurchase && (
        <div className="rounded-md border border-neutral-200 p-4">
          <h4 className="mb-1 text-sm font-medium text-neutral-700">Start a sale</h4>
          <p className="mb-3 text-xs text-neutral-400">
            Buyer details belong to the sale, not the artwork — nothing here is saved until you
            start the sale below.
          </p>

          <div className="mb-4 flex gap-2 border-b border-neutral-200">
            <button
              type="button"
              onClick={() => setChannel("STRIPE")}
              className={`px-3 py-1.5 text-sm font-medium ${
                channel === "STRIPE"
                  ? "border-b-2 border-neutral-900 text-neutral-900"
                  : "text-neutral-400 hover:text-neutral-600"
              }`}
            >
              Sold via Stripe
            </button>
            <button
              type="button"
              onClick={() => setChannel("GALLERY")}
              className={`px-3 py-1.5 text-sm font-medium ${
                channel === "GALLERY"
                  ? "border-b-2 border-neutral-900 text-neutral-900"
                  : "text-neutral-400 hover:text-neutral-600"
              }`}
            >
              Sold via Gallery
            </button>
          </div>

          {channel === "STRIPE" ? (
            <form action={handleStartPurchase} className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Buyer name
                  </label>
                  <input
                    type="text"
                    name="buyerName"
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Buyer email
                  </label>
                  <input
                    type="email"
                    name="buyerEmail"
                    required
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Payment type
                  </label>
                  <select
                    name="type"
                    value={purchaseType}
                    onChange={(e) => setPurchaseType(e.target.value as "FULL" | "INSTALMENTS")}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  >
                    <option value="FULL">Full payment</option>
                    <option value="INSTALMENTS">Instalments ({terms.instalmentCount})</option>
                  </select>
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
                    <option value="">— Not set —</option>
                    {saleSources.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                Start sale
              </button>
            </form>
          ) : (
            <form action={handleStartGallerySale} className="space-y-3">
              <p className="text-xs text-neutral-400">
                No card is taken here — this raises an unpaid invoice for the net amount, which
                you mark as paid manually once the gallery actually pays.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Gallery / buyer name
                  </label>
                  <input
                    type="text"
                    name="buyerName"
                    required
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Email (optional)
                  </label>
                  <input
                    type="email"
                    name="buyerEmail"
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Billing address <span className="font-normal text-neutral-400">(for the invoice)</span>
                </label>
                <textarea
                  name="buyerAddress"
                  rows={2}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Sale price
                  </label>
                  <input
                    type="text"
                    name="totalAmount"
                    required
                    value={gallerySalePrice}
                    onChange={(e) => setGallerySalePrice(e.target.value)}
                    placeholder="e.g. 250.00"
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Commission %
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
                    Net owed
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={gallerySalePriceNum ? formatMoney(galleryNet.toFixed(2), "GBP") : "—"}
                    className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Sale source
                </label>
                <select
                  name="source"
                  defaultValue=""
                  className="w-full max-w-[calc(50%-0.5rem)] rounded-md border border-neutral-300 px-3 py-2 text-sm"
                >
                  <option value="">— Not set —</option>
                  {saleSources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                Start sale
              </button>
            </form>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      )}

      {activePurchase && (
        <div className="rounded-md border border-neutral-200 p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h4 className="text-sm font-medium text-neutral-700">
              {activePurchase.channel === "GALLERY"
                ? "Gallery sale"
                : activePurchase.type === "FULL"
                  ? "Full payment"
                  : `${activePurchase.instalmentCount} instalments`}
            </h4>
            <span className="text-sm text-neutral-900">
              {formatMoney(activePurchase.totalAmount, activePurchase.currency)}
            </span>
          </div>
          <p className="mb-3 text-xs text-neutral-500">
            {activePurchase.buyerName}
            {activePurchase.buyerName && activePurchase.buyerEmail ? " · " : ""}
            {activePurchase.buyerEmail}
            {activePurchase.source ? ` · ${activePurchase.source}` : ""}
          </p>

          {activePurchase.channel === "GALLERY" ? (
            <div className="mb-3">
              <span className="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                UNPAID
              </span>
              {activePurchase.commissionPercent && (
                <p className="mt-2 text-xs text-neutral-500">
                  Commission {activePurchase.commissionPercent}% — net owed{" "}
                  {formatMoney(
                    (
                      parseFloat(activePurchase.totalAmount) *
                      (1 - parseFloat(activePurchase.commissionPercent) / 100)
                    ).toFixed(2),
                    activePurchase.currency
                  )}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleMarkPaid}
                  disabled={isPending}
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                >
                  Mark as paid
                </button>
                <button
                  type="button"
                  onClick={() => downloadInvoice(activePurchase.id)}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                >
                  Download invoice
                </button>
              </div>
            </div>
          ) : activePurchase.payments.length === 0 ? (
            <>
              <p className="mb-3 text-xs text-neutral-400">
                Either option saves the buyer&apos;s card on file, so future instalments (if any)
                can be charged automatically without them needing to be present.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleGetLink}
                  disabled={isPending}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
                >
                  Get payment link
                </button>
                <button
                  type="button"
                  onClick={handleEnterCard}
                  disabled={isPending}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
                >
                  Enter card now
                </button>
              </div>

              {linkUrl && (
                <div className="mt-3 rounded-md bg-neutral-50 p-3">
                  <p className="mb-1 text-xs text-neutral-500">
                    Send this link to the buyer (copy and paste — nothing is emailed
                    automatically):
                  </p>
                  <input
                    readOnly
                    value={linkUrl}
                    onFocus={(e) => e.target.select()}
                    className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs"
                  />
                </div>
              )}

              {cardSecret && (
                <div className="mt-3">
                  <StripeCardForm
                    clientSecret={cardSecret}
                    onDone={() => {
                      setCardSecret(null);
                      router.refresh();
                      onChanged?.();
                    }}
                  />
                  <p className="mt-2 text-xs text-neutral-400">
                    Status below updates within a few seconds of Stripe confirming the charge.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-neutral-400">
                    <th className="pb-1 font-normal">#</th>
                    <th className="pb-1 font-normal">Amount</th>
                    <th className="pb-1 font-normal">Status</th>
                    <th className="pb-1 font-normal">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {activePurchase.payments.map((p) => (
                    <tr key={p.id} className="border-t border-neutral-100">
                      <td className="py-1.5 text-neutral-500">{p.sequence}</td>
                      <td className="py-1.5">{formatMoney(p.amount, p.currency)}</td>
                      <td className="py-1.5">
                        <span
                          className={
                            p.status === "PAID"
                              ? "text-green-600"
                              : p.status === "FAILED"
                                ? "text-red-600"
                                : "text-neutral-500"
                          }
                        >
                          {p.status === "PAID" ? "Paid" : p.status === "FAILED" ? "Failed" : "Due"}
                        </span>
                      </td>
                      <td className="py-1.5 text-neutral-500">
                        {p.paidDate
                          ? new Date(p.paidDate).toLocaleDateString()
                          : p.dueDate
                            ? new Date(p.dueDate).toLocaleDateString()
                            : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={() => downloadInvoice(activePurchase.id)}
                className="mt-3 rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Download invoice
              </button>
            </>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <form action={handleSaveRelease} className="mt-4 space-y-3 border-t border-neutral-100 pt-4">
            <h5 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
              Release message for this sale
            </h5>
            {releaseReached && (
              <p className="rounded bg-green-50 px-2 py-1 text-xs text-green-700">
                Trigger reached — this message now applies.
              </p>
            )}
            <textarea
              name="releaseMessage"
              defaultValue={activePurchase.releaseMessage ?? ""}
              rows={2}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              type="number"
              name="releaseTriggerCount"
              min={1}
              defaultValue={activePurchase.releaseTriggerCount ?? ""}
              placeholder="Release after this many payments"
              className="w-full max-w-[calc(50%-0.5rem)] rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
              >
                Save
              </button>
              {saved && <span className="text-sm text-green-600">Saved</span>}
              <button
                type="button"
                onClick={handleAbandon}
                disabled={isPending}
                className="ml-auto text-sm text-red-600 hover:underline disabled:opacity-50"
              >
                Cancel sale
              </button>
            </div>
          </form>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
            Past sale attempts
          </h4>
          <div className="space-y-2">
            {history.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-md border border-neutral-100 px-3 py-2 text-sm"
              >
                <div>
                  <span className="text-neutral-700">{p.buyerName || p.buyerEmail}</span>
                  <span className="ml-2 text-neutral-400">
                    {formatMoney(p.totalAmount, p.currency)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={p.status === "COMPLETED" ? "text-green-600" : "text-neutral-400"}
                  >
                    {p.status === "COMPLETED" ? "Completed" : "Abandoned"}
                  </span>
                  <span className="text-neutral-400">
                    {p.closedAt ? new Date(p.closedAt).toLocaleDateString() : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => downloadInvoice(p.id)}
                    className="text-neutral-500 hover:underline"
                  >
                    Invoice
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
