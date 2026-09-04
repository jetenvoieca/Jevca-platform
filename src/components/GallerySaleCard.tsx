"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markGallerySalePaid,
  abandonPurchase,
  deleteGallerySale,
  createGalleryPaymentLink,
  type PurchaseDetail,
} from "@/lib/actions/payments";
import ConfirmDialog from "@/components/ConfirmDialog";
import InvoiceEmailModal from "@/components/InvoiceEmailModal";
import CertificateEmailModal from "@/components/CertificateEmailModal";

const inputCls =
  "w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50";
const labelCls = "mb-1 block text-xs text-neutral-500";
const actionButtonCls =
  "rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50";

function formatMoney(amount: string, currency: string) {
  const n = parseFloat(amount);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
}

function netOwed(totalAmount: string, commissionPercent: string | null) {
  const total = parseFloat(totalAmount);
  const commission = commissionPercent ? parseFloat(commissionPercent) : 0;
  return total - total * (commission / 100);
}

// Exported so callers that list several sales at once (GalleriesView's
// own Sales tab table, SalesView's list) can use the exact same badge
// rather than a second copy of the same three-line component.
export function SaleStatusBadge({ status }: { status: "ACTIVE" | "COMPLETED" | "ABANDONED" }) {
  if (status === "COMPLETED") {
    return <span className="text-sm text-green-600">Completed</span>;
  }
  if (status === "ABANDONED") {
    return <span className="text-sm text-neutral-400">Abandoned</span>;
  }
  return (
    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      UNPAID
    </span>
  );
}

// The single, shared view of one GALLERY-channel sale — ACTIVE (unpaid,
// still being chased) or COMPLETED (paid) — used everywhere a gallery
// sale can be opened: the Galleries page's own Consigned Works panel,
// the Artwork Catalogue's Payment tab (PurchasePanel), and the Sales
// page (2026-09-03). Previously each of those three places had its own
// hand-rolled version of this UI, which is exactly how the Sales page's
// copy drifted behind GalleriesView's — old plain "Mark as paid" confirm
// dialog with no Date paid/Method capture, "Download invoice" instead of
// the newer Send invoice/Send receipt flow, a single amount instead of
// the Sale Price/Net Sale row. Pulling it into one component is what
// actually stops that happening again, rather than just re-syncing the
// three copies once more.
//
// Deliberately never rendered for an ABANDONED sale — none of the three
// callers ever showed a bespoke abandoned-sale view before either; that
// status still falls through to SaleDetailCard's generic read-only card
// everywhere, unchanged.
export default function GallerySaleCard({
  purchase,
  siteId,
  paymentMethods,
  onChanged,
}: {
  purchase: PurchaseDetail;
  siteId: string;
  // Offered in the "Mark as paid" Method dropdown — Settings-editable,
  // same list the Payment Methods card on the Artwork Catalogue's
  // Settings screen manages (artworkSettings.ts).
  paymentMethods: string[];
  // Called after any action that changes this sale (paid, cancelled,
  // deleted, invoice sent, payment link generated) — the caller owns
  // re-fetching whatever data it's displaying elsewhere (a row in a
  // table, a gallery's totals, etc.); this component holds no server
  // data itself beyond the `purchase` it was handed.
  onChanged: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ---- Mark as paid — inline Date paid / Method form ----
  const [showMarkPaidForm, setShowMarkPaidForm] = useState(false);
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidMethod, setPaidMethod] = useState("");

  // ---- Invoice/receipt email + Stripe payment link ----
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [preparingInvoice, setPreparingInvoice] = useState(false);
  const [paymentLinkError, setPaymentLinkError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // ---- Certificate of Authenticity — only ever offered once paid ----
  const [showCertificateModal, setShowCertificateModal] = useState(false);

  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const isPaid = purchase.status === "COMPLETED";
  const completedPayment = isPaid ? (purchase.payments[0] ?? null) : null;

  const handleMarkPaidClick = () => {
    setError(null);
    setPaidDate(new Date().toISOString().slice(0, 10));
    setPaidMethod(paymentMethods[0] || "");
    setShowMarkPaidForm(true);
  };

  const handleConfirmMarkPaid = () => {
    setError(null);
    const fd = new FormData();
    fd.set("paidDate", paidDate);
    fd.set("method", paidMethod);
    startTransition(async () => {
      const res = await markGallerySalePaid(purchase.id, siteId, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setShowMarkPaidForm(false);
      onChanged();
      router.refresh();
    });
  };

  const handleCancelSale = () => {
    setPendingConfirm({
      title: "Cancel this sale?",
      message: "It'll be kept in the history, marked as abandoned.",
      confirmLabel: "Cancel sale",
      danger: true,
      onConfirm: () => {
        setPendingConfirm(null);
        setError(null);
        startTransition(async () => {
          const res = await abandonPurchase(purchase.id, siteId);
          if (!res.ok) setError(res.error);
          onChanged();
          router.refresh();
        });
      },
    });
  };

  const handleDeleteSale = () => {
    const message = purchase.invoiceNumber
      ? `An invoice (#${purchase.invoiceNumber}) was already generated for it — deleting will leave a gap in your invoice numbering, which is fine but can't be undone. This removes the sale entirely.`
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
          const res = await deleteGallerySale(purchase.id, siteId);
          if (!res.ok) {
            setError(res.error);
            return;
          }
          onChanged();
          router.refresh();
        });
      },
    });
  };

  // Send invoice auto-generates the payment link first if this sale is
  // still ACTIVE and doesn't already have one, so the emailed invoice
  // always includes a way to pay without a separate manual step. A paid
  // sale never needs a link generated first — it opens the modal
  // straight away. If link generation fails, the modal still opens
  // rather than blocking the invoice — the email falls back to its
  // non-link wording, and a link can always be generated afterwards from
  // the Payment link section below.
  const handleOpenInvoiceModal = () => {
    if (purchase.status !== "ACTIVE" || purchase.stripePaymentLinkUrl) {
      setShowInvoiceModal(true);
      return;
    }
    setPaymentLinkError(null);
    setPreparingInvoice(true);
    startTransition(async () => {
      const res = await createGalleryPaymentLink(purchase.id, siteId);
      if (!res.ok) setPaymentLinkError(res.error);
      onChanged();
      setPreparingInvoice(false);
      setShowInvoiceModal(true);
    });
  };

  const handleGetPaymentLink = () => {
    setPaymentLinkError(null);
    startTransition(async () => {
      // Idempotent — if this sale already has a link, it just returns
      // the existing one rather than creating a duplicate, so this is
      // safe to call every time the button is pressed.
      const res = await createGalleryPaymentLink(purchase.id, siteId);
      if (!res.ok) {
        setPaymentLinkError(res.error);
        return;
      }
      onChanged();
    });
  };

  const handleCopyPaymentLink = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    });
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-medium text-neutral-900">
          Sale Price {formatMoney(purchase.totalAmount, purchase.currency)}
        </p>
        <p className="text-sm font-medium text-neutral-900">
          Net Sale{" "}
          {formatMoney(
            netOwed(purchase.totalAmount, purchase.commissionPercent).toFixed(2),
            purchase.currency
          )}
        </p>
      </div>
      <SaleStatusBadge status={purchase.status} />
      <p className="mt-2 text-xs text-neutral-400">
        Sold {new Date(purchase.createdAt).toLocaleDateString()}
      </p>

      {isPaid && completedPayment?.paidDate && (
        <p className="mt-1 text-xs text-green-600">
          Paid {new Date(completedPayment.paidDate).toLocaleDateString()}
          {completedPayment.method ? ` — ${completedPayment.method}` : ""}
        </p>
      )}

      {/* A simple sent-log, not a full send history — shows the most
          recent send only. Matches Purchase's invoiceEmailedAt/
          invoiceEmailedTo columns, which are overwritten on each send
          rather than accumulating a list. */}
      {purchase.invoiceEmailedAt && (
        <p className="mt-1 text-xs text-neutral-400">
          {isPaid ? "Receipt sent" : "Invoice sent"}{" "}
          {new Date(purchase.invoiceEmailedAt).toLocaleDateString()}
          {purchase.invoiceEmailedTo ? ` to ${purchase.invoiceEmailedTo}` : ""}
        </p>
      )}

      {/* Same simple sent-log pattern as invoiceEmailedAt above — only
          ever shown once paid, since a certificate can't be requested
          before that. */}
      {purchase.certificateEmailedAt && (
        <p className="mt-1 text-xs text-neutral-400">
          Certificate sent {new Date(purchase.certificateEmailedAt).toLocaleDateString()}
          {purchase.certificateEmailedTo ? ` to ${purchase.certificateEmailedTo}` : ""}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {isPaid ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleOpenInvoiceModal}
            disabled={isPending}
            className={actionButtonCls}
          >
            {purchase.invoiceEmailedAt ? "Send receipt again" : "Send receipt"}
          </button>
          <button
            type="button"
            onClick={() => setShowCertificateModal(true)}
            disabled={isPending}
            className={actionButtonCls}
          >
            {purchase.certificateEmailedAt
              ? "Send certificate again"
              : "Certificate of Authenticity"}
          </button>
        </div>
      ) : (
        <>
          {/* 2x2 action grid — all four sale actions as equal-weight
              solid buttons. Cancel Sale and Delete Sale still get a
              ConfirmDialog before anything actually happens. */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleOpenInvoiceModal}
              disabled={isPending}
              className={actionButtonCls}
            >
              {preparingInvoice
                ? "Preparing…"
                : purchase.invoiceEmailedAt
                  ? "Send invoice again"
                  : "Send invoice"}
            </button>
            <button
              type="button"
              onClick={handleCancelSale}
              disabled={isPending}
              className={actionButtonCls}
            >
              Cancel Sale
            </button>
            <button
              type="button"
              onClick={handleMarkPaidClick}
              disabled={isPending}
              className={actionButtonCls}
            >
              Mark as paid
            </button>
            <button
              type="button"
              onClick={handleDeleteSale}
              disabled={isPending}
              className={actionButtonCls}
            >
              Delete Sale
            </button>
          </div>

          {showMarkPaidForm && (
            <div className="mt-3 space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
              <div>
                <label className={labelCls}>Date paid</label>
                <input
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Method</label>
                <select
                  value={paidMethod}
                  onChange={(e) => setPaidMethod(e.target.value)}
                  className={inputCls}
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
                  onClick={handleConfirmMarkPaid}
                  disabled={isPending || !paidMethod}
                  className="flex-1 rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-white hover:bg-neutral-700 disabled:opacity-50"
                >
                  Paid
                </button>
                <button
                  type="button"
                  onClick={() => setShowMarkPaidForm(false)}
                  disabled={isPending}
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-white disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Payment link — persistent, net-owed link, separate from the
              full-price links used for direct Stripe sales elsewhere.
              Generated automatically the first time "Send invoice" is
              used, but still shown and copyable here, and still
              generatable on its own ahead of sending an invoice. */}
          <div className="mt-3 border-t border-neutral-100 pt-3">
            {purchase.stripePaymentLinkUrl ? (
              <div>
                <label className={labelCls}>Payment link</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={purchase.stripePaymentLinkUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-600"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopyPaymentLink(purchase.stripePaymentLinkUrl!)}
                    className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                  >
                    {linkCopied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGetPaymentLink}
                disabled={isPending}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
              >
                {isPending ? "Generating…" : "Get payment link"}
              </button>
            )}
            {paymentLinkError && <p className="mt-2 text-xs text-red-600">{paymentLinkError}</p>}
          </div>
        </>
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
          purchaseId={purchase.id}
          siteId={siteId}
          isPaid={isPaid}
          onClose={() => setShowInvoiceModal(false)}
          onSent={onChanged}
        />
      )}

      {showCertificateModal && (
        <CertificateEmailModal
          purchaseId={purchase.id}
          siteId={siteId}
          onClose={() => setShowCertificateModal(false)}
          onSent={onChanged}
        />
      )}
    </div>
  );
}
