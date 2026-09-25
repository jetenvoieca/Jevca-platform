"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteGallerySale,
  forceDeleteCompletedSale,
  updatePurchaseRelease,
  abandonPurchase,
  createCardEntryIntent,
  markSalePaid,
  type CardEntry,
  type PurchaseDetail,
} from "@/lib/actions/payments";
import { formatDate } from "@/lib/formatDate";
import StripeCardForm from "@/components/StripeCardForm";
import ConfirmDialog from "@/components/ConfirmDialog";
import CertificateEmailModal from "@/components/CertificateEmailModal";
import InvoiceEmailModal from "@/components/InvoiceEmailModal";

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

// The panel for an unpaid direct Stripe sale — one started from the
// Studio app by payment link or card (studioSales.ts) — opened from the
// Sales page's sale modal (SaleModal). Every other sale opens in
// GallerySaleCard instead. Shows the sale and its payments, lets the
// artist send the invoice, take the card, or record it as paid outside
// Stripe, edit an instalment sale's release message, and cancel or
// delete it; below, the artwork's past sale attempts.
//
// Due to be replaced by GallerySaleCard once Studio sales move onto it
// (see the handover notes, 2026-09-23).
export default function PurchasePanel({
  siteId,
  activePurchase,
  history,
  // Offered in the Method dropdown of the "Record sale" form below.
  paymentMethods = [],
  onChanged,
}: {
  siteId: string;
  activePurchase: PurchaseDetail;
  history: PurchaseDetail[];
  paymentMethods?: string[];
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Certificate of Authenticity (2026-09-10, direct request — "add to
  // all sales, completed or not") — a single modal shared between the
  // active purchase's own button and any completed history row's,
  // holding whichever purchase id it's currently open for (or null).
  const [certificateModalId, setCertificateModalId] = useState<string | null>(null);
  // "Send invoice" on an unpaid sale (2026-09-21) — the invoice preview
  // and email window.
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  // "Record sale" on an unpaid sale (2026-09-21) — the inline Date paid /
  // Payment type form, same idea as GallerySaleCard's "Mark as Paid".
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [paidDate, setPaidDate] = useState("");
  const [paidMethod, setPaidMethod] = useState("");
  const [cardEntry, setCardEntry] = useState<CardEntry | null>(null);
  // Drives ConfirmDialog for every sale-related confirmation on this
  // panel (2026-08-13, replacing native confirm() — see ConfirmDialog
  // for why).
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const handleSaveRelease = (formData: FormData) => {
    startTransition(async () => {
      await updatePurchaseRelease(activePurchase.id, siteId, formData);
      setSaved(true);
      if (onChanged) onChanged();
      else router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const handleAbandon = () => {
    setPendingConfirm({
      title: "Cancel this sale?",
      message: "It'll be kept in the history below, marked as abandoned.",
      confirmLabel: "Cancel sale",
      danger: true,
      onConfirm: () => {
        setPendingConfirm(null);
        setError(null);
        startTransition(async () => {
          const res = await abandonPurchase(activePurchase.id, siteId);
          if (!res.ok) setError(res.error);
          if (onChanged) onChanged();
          else router.refresh();
        });
      },
    });
  };

  // For a genuinely wrong sale (not just one that fell through) —
  // deliberately a separate, harder confirmation from "Cancel" above,
  // since this can't be undone. Warns specifically about invoice number
  // gaps, since that's the one consequence that isn't obvious from the
  // UI alone (2026-08-13).
  const handleDeleteHistoryItem = (p: PurchaseDetail) => {
    const message = p.invoiceNumber
      ? `An invoice (#${p.invoiceNumber}) was already generated for it — deleting will leave a gap in your invoice numbering, which is fine but can't be undone. This removes the sale entirely, not just from this list.`
      : "This removes the sale entirely, not just from this list — it cannot be undone.";
    setPendingConfirm({
      title: "Delete this sale permanently?",
      message,
      confirmLabel: "Delete permanently",
      danger: true,
      onConfirm: () => {
        setPendingConfirm(null);
        setError(null);
        startTransition(async () => {
          const res = await deleteGallerySale(p.id, siteId);
          if (!res.ok) setError(res.error);
          if (onChanged) onChanged();
          else router.refresh();
        });
      },
    });
  };

  // Separate, deliberately harder-to-reach path for removing a genuinely
  // completed, paid sale (2026-08-13, at the person's explicit request
  // for cleaning up test data). Never the default option — this is the
  // only place in the app that can do this, and the wording says
  // plainly what it's destroying.
  const handleForceDeleteCompleted = (p: PurchaseDetail) => {
    setPendingConfirm({
      title: "Force delete this completed sale?",
      message:
        "This sale is marked as paid — deleting it removes it as a financial record entirely, permanently, including its invoice/receipt number. Only do this for test or clearly erroneous data, never for a real transaction.",
      confirmLabel: "Force delete",
      danger: true,
      onConfirm: () => {
        setPendingConfirm(null);
        setError(null);
        startTransition(async () => {
          const res = await forceDeleteCompletedSale(p.id, siteId);
          if (!res.ok) setError(res.error);
          if (onChanged) onChanged();
          else router.refresh();
        });
      },
    });
  };

  // Direct delete for the unpaid sale — added 2026-08-13 so a genuinely
  // wrong transaction (wrong buyer, wrong price) doesn't need the extra
  // "cancel first, then delete from history" round trip.
  const handleDeleteActiveSale = () => {
    const message = activePurchase.invoiceNumber
      ? `An invoice (#${activePurchase.invoiceNumber}) was already generated for it — deleting will leave a gap in your invoice numbering, which is fine but can't be undone. This removes the sale entirely.`
      : "This removes the sale entirely — it cannot be undone.";
    setPendingConfirm({
      title: "Delete this sale permanently?",
      message,
      confirmLabel: "Delete permanently",
      danger: true,
      onConfirm: () => {
        setPendingConfirm(null);
        setError(null);
        startTransition(async () => {
          const res = await deleteGallerySale(activePurchase.id, siteId);
          if (!res.ok) setError(res.error);
          if (onChanged) onChanged();
          else router.refresh();
        });
      },
    });
  };

  const handleEnterCard = () => {
    setError(null);
    setCardEntry(null);
    startTransition(async () => {
      const result = await createCardEntryIntent(activePurchase.id, siteId);
      if (result.ok) {
        setCardEntry({
          clientSecret: result.clientSecret,
          publishableKey: result.publishableKey,
          stripeAccount: result.stripeAccount,
        });
      } else {
        setError(result.error);
      }
    });
  };

  // Opens the inline "Record sale" form on an unpaid sale, starting from
  // today's date with no payment type chosen yet.
  const handleRecordSaleClick = () => {
    setError(null);
    setPaidDate(new Date().toISOString().slice(0, 10));
    setPaidMethod("");
    setShowRecordForm(true);
  };

  const handleConfirmRecordSale = () => {
    setError(null);
    const fd = new FormData();
    fd.set("paidDate", paidDate);
    fd.set("method", paidMethod);
    startTransition(async () => {
      const res = await markSalePaid(activePurchase.id, siteId, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setShowRecordForm(false);
      if (onChanged) onChanged();
      else router.refresh();
    });
  };

  const paidCount = activePurchase.payments.filter((p) => p.status === "PAID").length;
  const releaseReached =
    !!activePurchase.releaseTriggerCount && paidCount >= activePurchase.releaseTriggerCount;

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-neutral-200 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h4 className="text-sm font-medium text-neutral-700">
            {activePurchase.type === "FULL"
              ? "Full payment"
              : `${activePurchase.instalmentCount} instalments`}
            {activePurchase.framed && (
              <span className="ml-1.5 text-xs font-normal text-neutral-400">(Framed)</span>
            )}
            {/* Nothing paid yet (2026-09-21). */}
            {activePurchase.payments.length === 0 && (
              <span className="ml-2 text-sm font-medium uppercase tracking-wide text-teal-800">
                Due
              </span>
            )}
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

        {activePurchase.payments.length === 0 ? (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowInvoiceModal(true)}
                disabled={isPending}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
              >
                Send invoice
              </button>
              <button
                type="button"
                onClick={handleEnterCard}
                disabled={isPending}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
              >
                Enter card now
              </button>
              <button
                type="button"
                onClick={handleRecordSaleClick}
                disabled={isPending}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
              >
                Record sale
              </button>
            </div>

            {showRecordForm && (
              <div className="mt-3 space-y-2 rounded-md border border-neutral-200 bg-white p-3">
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">Date paid</label>
                  <input
                    type="date"
                    value={paidDate}
                    onChange={(e) => setPaidDate(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">Payment type</label>
                  <select
                    value={paidMethod}
                    onChange={(e) => setPaidMethod(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                  >
                    <option value="">Choose…</option>
                    {paymentMethods.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmRecordSale}
                    disabled={
                      isPending || !paidDate || (paymentMethods.length > 0 && !paidMethod)
                    }
                    className="flex-1 rounded-md bg-neutral-900 px-3 py-[5px] text-sm font-semibold uppercase tracking-wide text-white hover:bg-neutral-700 disabled:opacity-50"
                  >
                    Paid
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRecordForm(false)}
                    disabled={isPending}
                    className="rounded-md border border-neutral-300 px-3 py-[5px] text-sm hover:bg-white disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {cardEntry && (
              <div className="mt-3">
                <StripeCardForm
                  clientSecret={cardEntry.clientSecret}
                  publishableKey={cardEntry.publishableKey}
                  stripeAccount={cardEntry.stripeAccount}
                  purchaseId={activePurchase.id}
                  onDone={() => {
                    setCardEntry(null);
                    if (onChanged) onChanged();
                    else router.refresh();
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
                        ? formatDate(p.paidDate)
                        : p.dueDate
                          ? formatDate(p.dueDate)
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadInvoice(activePurchase.id)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Download invoice
              </button>
              <button
                type="button"
                onClick={() => setCertificateModalId(activePurchase.id)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                {activePurchase.certificateEmailedAt
                  ? "Send certificate again"
                  : "Certificate of Authenticity"}
              </button>
            </div>
          </>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {activePurchase.type === "INSTALMENTS" && (
          <form
            action={handleSaveRelease}
            className="mt-4 space-y-3 border-t border-neutral-100 pt-4"
          >
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
            </div>
          </form>
        )}

        <div
          className={
            activePurchase.type === "INSTALMENTS"
              ? "mt-3"
              : "mt-4 border-t border-neutral-100 pt-4"
          }
        >
          <button
            type="button"
            onClick={handleAbandon}
            disabled={isPending}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            Cancel sale
          </button>
          <span className="mx-2 text-neutral-300">·</span>
          <button
            type="button"
            onClick={handleDeleteActiveSale}
            disabled={isPending}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

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
                    {p.framed && " (Framed)"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={p.status === "COMPLETED" ? "text-green-600" : "text-neutral-400"}
                  >
                    {p.status === "COMPLETED" ? "Completed" : "Abandoned"}
                  </span>
                  <span className="text-neutral-400">{p.closedAt ? formatDate(p.closedAt) : ""}</span>
                  <button
                    type="button"
                    onClick={() => downloadInvoice(p.id)}
                    className="text-neutral-500 hover:underline"
                  >
                    {p.status === "COMPLETED" ? "Receipt" : "Invoice"}
                  </button>
                  {p.status === "COMPLETED" && (
                    <button
                      type="button"
                      onClick={() => setCertificateModalId(p.id)}
                      className="text-neutral-500 hover:underline"
                    >
                      Certificate
                    </button>
                  )}
                  {p.status !== "COMPLETED" && (
                    <button
                      type="button"
                      onClick={() => handleDeleteHistoryItem(p)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                  {p.status === "COMPLETED" && (
                    <button
                      type="button"
                      onClick={() => handleForceDeleteCompleted(p)}
                      className="text-red-600 hover:underline"
                    >
                      Force delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ""}
        message={pendingConfirm?.message ?? ""}
        confirmLabel={pendingConfirm?.confirmLabel ?? ""}
        danger={pendingConfirm?.danger}
        onConfirm={() => pendingConfirm?.onConfirm()}
        onCancel={() => setPendingConfirm(null)}
      />

      {showInvoiceModal && (
        <InvoiceEmailModal
          purchaseId={activePurchase.id}
          siteId={siteId}
          onClose={() => setShowInvoiceModal(false)}
          onSent={onChanged ?? (() => router.refresh())}
        />
      )}

      {certificateModalId && (
        <CertificateEmailModal
          purchaseId={certificateModalId}
          siteId={siteId}
          onClose={() => setCertificateModalId(null)}
          onSent={onChanged ?? (() => router.refresh())}
        />
      )}
    </div>
  );
}
