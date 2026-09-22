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
import { netOwed } from "@/lib/saleMath";
import { formatDate } from "@/lib/formatDate";
import ConfirmDialog from "@/components/ConfirmDialog";
import InvoiceEmailModal from "@/components/InvoiceEmailModal";
import CertificateEmailModal from "@/components/CertificateEmailModal";

const inputCls =
  "w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50";
const labelCls = "mb-1 block text-xs text-neutral-500";

// Every action-panel button: #5E5E5E with #F9F6EE text.
const actionButtonCls =
  "rounded-md bg-[#5E5E5E] px-3 py-2 text-sm text-[#F9F6EE] hover:bg-[#4a4a4a] disabled:opacity-50";

// Arrange Framing / Arrange Delivery / Take Card — built in later parts.
// Styled like a real action button so the grid reads as one set.
const placeholderButtonCls = `${actionButtonCls} opacity-60`;

function formatMoney(amount: string, currency: string) {
  const n = parseFloat(amount);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
}

// Status badge for list/table rows (Locations Sales tab, Sales page,
// Consolidated Sales). Not shown inside the card itself — the card's
// own status area replaces it there.
export function SaleStatusBadge({
  status,
  invoiceEmailedAt,
}: {
  status: "ACTIVE" | "COMPLETED" | "ABANDONED";
  invoiceEmailedAt?: string | null;
}) {
  if (status === "COMPLETED") {
    return <span className="text-sm text-green-600">Completed</span>;
  }
  if (status === "ABANDONED") {
    return <span className="text-sm text-neutral-400">Abandoned</span>;
  }
  return (
    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      {invoiceEmailedAt ? "Invoice sent" : "UNPAID"}
    </span>
  );
}

// The single shared view of one GALLERY-channel sale (ACTIVE or
// COMPLETED), used everywhere such a sale can be opened. Three parts,
// top to bottom: Sales details (price / Net Due), Sales status (what's
// been paid and sent), and the Action panel. ABANDONED sales never come
// here — callers show SaleDetailCard for those.
export default function GallerySaleCard({
  purchase,
  siteId,
  paymentMethods,
  onChanged,
}: {
  purchase: PurchaseDetail;
  siteId: string;
  // Offered in the Record Payment Method dropdown (Settings-editable).
  paymentMethods: string[];
  // Called after any action that changes this sale; the caller re-fetches.
  onChanged: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ---- Record Payment — inline Date paid / Method form ----
  const [showMarkPaidForm, setShowMarkPaidForm] = useState(false);
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidMethod, setPaidMethod] = useState("");

  // ---- Invoice/receipt email + Stripe payment link ----
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [preparingInvoice, setPreparingInvoice] = useState(false);
  const [paymentLinkError, setPaymentLinkError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // ---- Certificate of Authenticity ----
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

  // Send invoice generates the payment link first (if the sale is still
  // unpaid and has none), so the emailed invoice always includes a way to
  // pay. If link generation fails the modal still opens — the email falls
  // back to its non-link wording.
  const handleOpenInvoiceModal = () => {
    if (isPaid || purchase.stripePaymentLinkUrl) {
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

  // Idempotent — returns the existing link if there is one.
  const handleGetPaymentLink = () => {
    setPaymentLinkError(null);
    startTransition(async () => {
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

  const handleArrangeFraming = () => alert("Arrange Framing — coming in a later phase.");
  const handleArrangeDelivery = () => alert("Arrange Delivery — coming in a later phase.");
  const handleTakeCard = () => alert("Take Card — coming in a later phase.");

  const netDue = netOwed(purchase.totalAmount, purchase.commissionPercent, purchase.depositPaid);

  return (
    <div>
      {/* ---- Sales details ---- */}
      <div className="flex items-end justify-between gap-4 text-sm font-medium text-neutral-900">
        <p>Sale price {formatMoney(purchase.totalAmount, purchase.currency)}</p>
        <p>Net Due {formatMoney((isPaid ? 0 : netDue).toFixed(2), purchase.currency)}</p>
      </div>

      {/* ---- Sales status ---- */}
      <div className="mt-3 min-h-[1.25rem] space-y-0.5 text-xs text-neutral-500">
        {isPaid && completedPayment?.paidDate && (
          <p>
            Paid {formatDate(completedPayment.paidDate)}
            {completedPayment.method ? ` — ${completedPayment.method}` : ""}
          </p>
        )}
        {purchase.invoiceEmailedAt && (
          <p>
            {isPaid ? "Receipt sent" : "Invoice sent"} {formatDate(purchase.invoiceEmailedAt)}
          </p>
        )}
        {purchase.certificateEmailedAt && (
          <p>Certificate of authenticity sent {formatDate(purchase.certificateEmailedAt)}</p>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {showMarkPaidForm && !isPaid && (
        <div className="mt-3 space-y-2 rounded-md border border-neutral-200 bg-white p-3">
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
              className={`flex-1 ${actionButtonCls}`}
            >
              Paid
            </button>
            <button
              type="button"
              onClick={() => setShowMarkPaidForm(false)}
              disabled={isPending}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!isPaid && purchase.stripePaymentLinkUrl && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            readOnly
            value={purchase.stripePaymentLinkUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-600"
          />
          <button
            type="button"
            onClick={() => handleCopyPaymentLink(purchase.stripePaymentLinkUrl!)}
            className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
          >
            {linkCopied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      {paymentLinkError && <p className="mt-2 text-xs text-red-600">{paymentLinkError}</p>}

      {/* ---- Action panel ---- */}
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-[#F9F6EE] p-3">
        <button type="button" onClick={handleArrangeFraming} className={placeholderButtonCls}>
          Arrange Framing
        </button>
        <button type="button" onClick={handleArrangeDelivery} className={placeholderButtonCls}>
          Arrange Delivery
        </button>
        {isPaid ? (
          <>
            <button
              type="button"
              onClick={handleOpenInvoiceModal}
              disabled={isPending}
              className={actionButtonCls}
            >
              Send Receipt
            </button>
            <button
              type="button"
              onClick={() => setShowCertificateModal(true)}
              disabled={isPending}
              className={actionButtonCls}
            >
              Certificate of Authenticity
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleOpenInvoiceModal}
              disabled={isPending}
              className={actionButtonCls}
            >
              {preparingInvoice ? "Preparing…" : "Send invoice"}
            </button>
            <button
              type="button"
              onClick={handleMarkPaidClick}
              disabled={isPending}
              className={actionButtonCls}
            >
              Record Payment
            </button>
            <button
              type="button"
              onClick={handleGetPaymentLink}
              disabled={isPending}
              className={actionButtonCls}
            >
              {isPending && !purchase.stripePaymentLinkUrl ? "Generating…" : "Payment link"}
            </button>
            <button type="button" onClick={handleTakeCard} className={placeholderButtonCls}>
              Take Card
            </button>
          </>
        )}
      </div>

      {/* ---- Cancel / Delete ---- */}
      {!isPaid && (
        <div className="mt-6 grid grid-cols-2 text-center text-sm text-red-700">
          <button
            type="button"
            onClick={handleCancelSale}
            disabled={isPending}
            className="hover:underline disabled:opacity-50"
          >
            Cancel Sale
          </button>
          <button
            type="button"
            onClick={handleDeleteSale}
            disabled={isPending}
            className="hover:underline disabled:opacity-50"
          >
            Delete Sale
          </button>
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
