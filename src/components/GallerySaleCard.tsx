"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markGallerySalePaid,
  abandonPurchase,
  deleteGallerySale,
  createGalleryPaymentLink,
  saveSaleExtra,
  type PurchaseDetail,
} from "@/lib/actions/payments";
import { saleBreakdown } from "@/lib/saleMath";
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

// Take Card — built in a later part. Styled like a real action button
// so the grid reads as one set.
const placeholderButtonCls = `${actionButtonCls} opacity-60`;

// Inputs inside the sliding panel — centred placeholder text, per mockup.
const drawerInputCls =
  "min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-center text-sm placeholder:text-neutral-400 disabled:opacity-50";

// Which input panel the action panel slides down to reveal.
type DrawerKind = "framing" | "delivery";

const DRAWER_COPY: Record<DrawerKind, { title: string; namePlaceholder: string }> = {
  framing: { title: "Arrange Framing", namePlaceholder: "Framer" },
  delivery: { title: "Arrange Delivery", namePlaceholder: "Courier firm" },
};

function TickIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
    </svg>
  );
}

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

  // ---- Sliding input panel (Arrange Framing / Arrange Delivery) ----
  // drawerKind keeps the last-opened panel's content in place while it
  // animates closed; drawerOpen drives the slide itself.
  const [drawerKind, setDrawerKind] = useState<DrawerKind>("framing");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [extraName, setExtraName] = useState("");
  const [extraCost, setExtraCost] = useState("");

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

  // Pressing the same button again closes the panel; pressing the other
  // one swaps its content in place. Prefilled from the saved entry, since
  // a sale has at most one of each and clicking again edits it.
  const openDrawer = (kind: DrawerKind) => {
    if (drawerOpen && drawerKind === kind) {
      setDrawerOpen(false);
      return;
    }
    setError(null);
    setDrawerKind(kind);
    setExtraName((kind === "framing" ? purchase.framer : purchase.courier) ?? "");
    setExtraCost((kind === "framing" ? purchase.framingCost : purchase.deliveryCost) ?? "");
    setDrawerOpen(true);
  };

  const handleSaveExtra = () => {
    setError(null);
    const fd = new FormData();
    fd.set("name", extraName.trim());
    fd.set("cost", extraCost.trim());
    startTransition(async () => {
      const res = await saveSaleExtra(purchase.id, siteId, drawerKind, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDrawerOpen(false);
      onChanged();
    });
  };

  // Framing/delivery after payment is covered in a later part.
  const handlePaidExtraPlaceholder = () => alert("Coming in a later phase.");
  const handleTakeCard = () => alert("Take Card — coming in a later phase.");

  const amounts = saleBreakdown(purchase);
  const money = (n: number) => formatMoney(n.toFixed(2), purchase.currency);

  return (
    <div>
      {/* ---- Sales details ---- */}
      <div className="flex items-end justify-between gap-4 text-sm font-medium text-neutral-900">
        <div className="space-y-0.5">
          <p>Sale price {money(amounts.salePrice)}</p>
          {amounts.framing > 0 && <p>Framing {money(amounts.framing)}</p>}
          {amounts.delivery > 0 && <p>Delivery {money(amounts.delivery)}</p>}
        </div>
        <p>Net Due {money(isPaid ? 0 : amounts.net)}</p>
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

      {/* ---- Sliding input panel ---- */}
      {/* Animates its height between 0 and its content (grid-rows
          0fr <-> 1fr), which pushes the action panel below down and back
          up smoothly. Content stays rendered while closing. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          drawerOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
        aria-hidden={!drawerOpen}
      >
        <div className="overflow-hidden">
          <div className="pt-4">
            <p className="rounded-md bg-neutral-100 py-1.5 text-center text-sm text-neutral-500">
              {DRAWER_COPY[drawerKind].title}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={extraName}
                onChange={(e) => setExtraName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveExtra()}
                placeholder={DRAWER_COPY[drawerKind].namePlaceholder}
                disabled={isPending}
                tabIndex={drawerOpen ? 0 : -1}
                className={`flex-[3] ${drawerInputCls}`}
              />
              <input
                type="text"
                inputMode="decimal"
                value={extraCost}
                onChange={(e) => setExtraCost(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveExtra()}
                placeholder="Cost"
                disabled={isPending}
                tabIndex={drawerOpen ? 0 : -1}
                className={`flex-[2] ${drawerInputCls}`}
              />
              <button
                type="button"
                onClick={handleSaveExtra}
                disabled={isPending}
                tabIndex={drawerOpen ? 0 : -1}
                aria-label="Save"
                className="shrink-0 rounded-md p-1 text-neutral-800 hover:bg-neutral-100 disabled:opacity-50"
              >
                <TickIcon />
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                disabled={isPending}
                tabIndex={drawerOpen ? 0 : -1}
                aria-label="Cancel"
                className="shrink-0 rounded-md p-1 text-neutral-800 hover:bg-neutral-100 disabled:opacity-50"
              >
                <CrossIcon />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Action panel ---- */}
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-[#F9F6EE] p-3">
        <button
          type="button"
          onClick={isPaid ? handlePaidExtraPlaceholder : () => openDrawer("framing")}
          disabled={isPending}
          className={isPaid ? placeholderButtonCls : actionButtonCls}
        >
          Arrange Framing
        </button>
        <button
          type="button"
          onClick={isPaid ? handlePaidExtraPlaceholder : () => openDrawer("delivery")}
          disabled={isPending}
          className={isPaid ? placeholderButtonCls : actionButtonCls}
        >
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
