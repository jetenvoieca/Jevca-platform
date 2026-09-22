"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  recordGalleryPayment,
  abandonPurchase,
  deleteGallerySale,
  createGalleryPaymentLink,
  getGalleryInstalmentDefault,
  saveSaleExtra,
  type PurchaseDetail,
} from "@/lib/actions/payments";
import { saleBreakdown, splitIntoInstalments } from "@/lib/saleMath";
import { formatDate } from "@/lib/formatDate";
import ConfirmDialog from "@/components/ConfirmDialog";
import InvoiceEmailModal from "@/components/InvoiceEmailModal";
import CertificateEmailModal from "@/components/CertificateEmailModal";

// Every action-panel button: #5E5E5E with #F9F6EE text.
const actionButtonCls =
  "rounded-md bg-[#5E5E5E] px-3 py-2 text-sm text-[#F9F6EE] hover:bg-[#4a4a4a] disabled:opacity-50";

// Take Card — built in a later part. Styled like a real action button
// so the grid reads as one set.
const placeholderButtonCls = `${actionButtonCls} opacity-60`;

// Inputs inside the sliding panel — centred text, per mockup.
const drawerInputCls =
  "min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-center text-sm placeholder:text-neutral-400 disabled:opacity-50";

const iconButtonCls =
  "shrink-0 rounded-md p-1 text-neutral-800 hover:bg-neutral-100 disabled:opacity-50";

// Which input panel the action panel slides down to reveal.
type DrawerKind = "framing" | "delivery" | "payment" | "link";

const DRAWER_TITLE: Record<DrawerKind, string> = {
  framing: "Arrange Framing",
  delivery: "Arrange Delivery",
  payment: "Record Payment",
  link: "Stripe payment link",
};

type LinkOption = "full" | "instalments";

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

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" strokeLinecap="round" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" strokeLinecap="round" />
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
// COMPLETED), used everywhere such a sale can be opened. Top to bottom:
// Sales details (price, extras, paid / Net Due), Sales status (payments
// and sends), a sliding input panel, and the Action panel. ABANDONED
// sales never come here — callers show SaleDetailCard for those.
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

  // ---- Invoice/receipt email ----
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [preparingInvoice, setPreparingInvoice] = useState(false);

  // ---- Certificate of Authenticity ----
  const [showCertificateModal, setShowCertificateModal] = useState(false);

  // ---- Sliding input panel ----
  // drawerKind keeps the last-opened panel's content in place while it
  // animates closed; drawerOpen drives the slide itself.
  const [drawerKind, setDrawerKind] = useState<DrawerKind>("framing");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Arrange Framing / Arrange Delivery
  const [extraName, setExtraName] = useState("");
  const [extraCost, setExtraCost] = useState("");

  // Record Payment
  const [payDate, setPayDate] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("");

  // Stripe payment link
  const [linkOption, setLinkOption] = useState<LinkOption | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [instalmentCount, setInstalmentCount] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const isPaid = purchase.status === "COMPLETED";
  const onInstalmentPlan = purchase.type === "INSTALMENTS";
  const amounts = saleBreakdown(purchase);
  const balance = isPaid ? 0 : amounts.balance;
  const money = (n: number) => formatMoney(n.toFixed(2), purchase.currency);

  const paidPayments = purchase.payments.filter((p) => p.status === "PAID");
  const nextDueInstalment = purchase.payments.find((p) => p.status === "DUE") ?? null;

  const count = parseInt(instalmentCount, 10);
  const countValid = Number.isInteger(count) && count >= 2 && count <= 36;
  const perInstalment = countValid && balance > 0 ? splitIntoInstalments(balance, count)[0] : null;

  // Pressing the same button again closes the panel; pressing another
  // swaps its content in place.
  const openDrawer = (kind: DrawerKind) => {
    if (drawerOpen && drawerKind === kind) {
      setDrawerOpen(false);
      return;
    }
    setError(null);
    setDrawerKind(kind);
    if (kind === "framing" || kind === "delivery") {
      // A sale has at most one of each — clicking again edits it.
      setExtraName((kind === "framing" ? purchase.framer : purchase.courier) ?? "");
      setExtraCost((kind === "framing" ? purchase.framingCost : purchase.deliveryCost) ?? "");
    } else if (kind === "payment") {
      setPayDate(new Date().toISOString().slice(0, 10));
      setPayAmount(balance.toFixed(2));
      setPayMethod(paymentMethods[0] || "");
    } else {
      setLinkOption(null);
      setLinkUrl(null);
      setLinkCopied(false);
      if (!instalmentCount) {
        getGalleryInstalmentDefault(purchase.id).then((n) => setInstalmentCount(String(n)));
      }
    }
    setDrawerOpen(true);
  };

  const runAndClose = (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDrawerOpen(false);
      onChanged();
      router.refresh();
    });
  };

  const handleSaveExtra = () => {
    const fd = new FormData();
    fd.set("name", extraName.trim());
    fd.set("cost", extraCost.trim());
    runAndClose(() => saveSaleExtra(purchase.id, siteId, drawerKind as "framing" | "delivery", fd));
  };

  const handleRecordPayment = () => {
    const fd = new FormData();
    fd.set("paidDate", payDate);
    fd.set("amount", payAmount.trim());
    fd.set("method", payMethod);
    runAndClose(() => recordGalleryPayment(purchase.id, siteId, fd));
  };

  // Clicking an option box selects it and shows its link (generated on
  // first use, reused after — see createGalleryPaymentLink).
  const handleChooseLink = (option: LinkOption) => {
    if (option === "instalments" && !countValid) {
      setError("Enter a number of instalments between 2 and 36.");
      return;
    }
    setError(null);
    setLinkOption(option);
    setLinkUrl(null);
    setLinkCopied(false);
    startTransition(async () => {
      const res = await createGalleryPaymentLink(
        purchase.id,
        siteId,
        option === "instalments" ? count : undefined
      );
      if (!res.ok) {
        setError(res.error);
        setLinkOption(null);
        return;
      }
      setLinkUrl(res.url);
      onChanged();
    });
  };

  // A new count means a different instalment amount, so any instalment
  // link on screen no longer applies until the box is clicked again.
  const handleCountChange = (value: string) => {
    setInstalmentCount(value.replace(/\D/g, "").slice(0, 2));
    if (linkOption === "instalments") {
      setLinkOption(null);
      setLinkUrl(null);
    }
  };

  const handleCopyLink = () => {
    if (!linkUrl) return;
    navigator.clipboard.writeText(linkUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
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

  // Send invoice generates the full-amount payment link first (if the
  // sale is still owed and has none), so the emailed invoice always
  // includes a way to pay. If that fails the modal still opens — the
  // email falls back to its non-link wording.
  const handleOpenInvoiceModal = () => {
    if (isPaid || onInstalmentPlan || purchase.stripePaymentLinkUrl) {
      setShowInvoiceModal(true);
      return;
    }
    setError(null);
    setPreparingInvoice(true);
    startTransition(async () => {
      const res = await createGalleryPaymentLink(purchase.id, siteId);
      if (!res.ok) setError(res.error);
      onChanged();
      setPreparingInvoice(false);
      setShowInvoiceModal(true);
    });
  };

  // Framing/delivery after payment is covered in a later part.
  const handlePaidExtraPlaceholder = () => alert("Coming in a later phase.");
  const handleTakeCard = () => alert("Take Card — coming in a later phase.");

  const optionBoxCls = (selected: boolean) =>
    `flex flex-col items-center justify-center rounded-lg border px-2 py-2 text-center leading-tight ${
      selected ? "border-neutral-900 text-neutral-900" : "border-neutral-300 text-neutral-500 hover:border-neutral-500"
    }`;

  return (
    <div>
      {/* ---- Sales details ---- */}
      <div className="flex items-end justify-between gap-4 text-sm font-medium text-neutral-900">
        <div className="space-y-0.5">
          <p>Sale price {money(amounts.salePrice)}</p>
          {amounts.framing > 0 && <p>Framing {money(amounts.framing)}</p>}
          {amounts.delivery > 0 && <p>Delivery {money(amounts.delivery)}</p>}
          {amounts.paid > 0 && <p>Paid {money(amounts.paid)}</p>}
        </div>
        <p>Net Due {money(balance)}</p>
      </div>

      {/* ---- Sales status ---- */}
      <div className="mt-3 min-h-[1.25rem] space-y-0.5 text-xs text-neutral-500">
        {paidPayments.map((p) => (
          <p key={p.id}>
            Paid {formatMoney(p.amount, p.currency)}
            {p.paidDate ? ` ${formatDate(p.paidDate)}` : ""}
            {p.method ? ` · ${p.method}` : ""}
          </p>
        ))}
        {onInstalmentPlan && !isPaid && purchase.instalmentCount && nextDueInstalment && (
          <p>
            Paying by {purchase.instalmentCount} instalments of{" "}
            {formatMoney(nextDueInstalment.amount, nextDueInstalment.currency)}
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

      {/* ---- Sliding input panel ---- */}
      {/* Animates its height between 0 and its content (grid-rows
          0fr <-> 1fr), which pushes the action panel below down and back
          up smoothly. Content stays rendered while closing. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          drawerOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
        aria-hidden={!drawerOpen}
        inert={!drawerOpen}
      >
        <div className="overflow-hidden">
          <div className="pt-4">
            <p className="rounded-md bg-neutral-100 py-1.5 text-center text-sm text-neutral-500">
              {DRAWER_TITLE[drawerKind]}
            </p>

            {(drawerKind === "framing" || drawerKind === "delivery") && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  value={extraName}
                  onChange={(e) => setExtraName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveExtra()}
                  placeholder={drawerKind === "framing" ? "Framer" : "Courier firm"}
                  disabled={isPending}
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
                  className={`flex-[2] ${drawerInputCls}`}
                />
                <button type="button" onClick={handleSaveExtra} disabled={isPending} aria-label="Save" className={iconButtonCls}>
                  <TickIcon />
                </button>
                <button type="button" onClick={() => setDrawerOpen(false)} disabled={isPending} aria-label="Cancel" className={iconButtonCls}>
                  <CrossIcon />
                </button>
              </div>
            )}

            {drawerKind === "payment" && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  disabled={isPending}
                  aria-label="Date"
                  className={`flex-1 ${drawerInputCls}`}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRecordPayment()}
                  placeholder="Amount"
                  disabled={isPending}
                  aria-label="Amount"
                  className={`flex-1 ${drawerInputCls}`}
                />
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  disabled={isPending}
                  aria-label="Method"
                  className={`flex-1 ${drawerInputCls}`}
                >
                  <option value="">Method…</option>
                  {paymentMethods.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleRecordPayment}
                  disabled={isPending || !payMethod}
                  aria-label="Save"
                  className={iconButtonCls}
                >
                  <TickIcon />
                </button>
                <button type="button" onClick={() => setDrawerOpen(false)} disabled={isPending} aria-label="Cancel" className={iconButtonCls}>
                  <CrossIcon />
                </button>
              </div>
            )}

            {drawerKind === "link" &&
              (onInstalmentPlan ? (
                <p className="mt-3 text-center text-sm text-neutral-500">
                  This sale is already being paid by instalments through Stripe.
                </p>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => handleChooseLink("full")}
                      disabled={isPending}
                      className={optionBoxCls(linkOption === "full")}
                    >
                      <span className="text-sm">Full amount</span>
                      <span className="text-base">{money(balance)}</span>
                    </button>
                    <label className={`cursor-text ${optionBoxCls(linkOption === "instalments")}`}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={instalmentCount}
                        onChange={(e) => handleCountChange(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleChooseLink("instalments")}
                        disabled={isPending}
                        aria-label="Number of instalments"
                        className="w-12 rounded border border-transparent bg-transparent text-center text-base text-neutral-900 hover:border-neutral-200 focus:border-neutral-400 focus:outline-none"
                      />
                      <span className="text-sm">Instalments</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleChooseLink("instalments")}
                      disabled={isPending}
                      className={optionBoxCls(linkOption === "instalments")}
                    >
                      <span className="text-sm">Instalments</span>
                      <span className="text-base">{perInstalment !== null ? money(perInstalment) : "—"}</span>
                    </button>
                  </div>
                  {linkOption && (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={linkUrl ?? "Generating…"}
                        onFocus={(e) => e.currentTarget.select()}
                        className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-600"
                      />
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        disabled={!linkUrl}
                        aria-label="Copy link"
                        className={iconButtonCls}
                      >
                        {linkCopied ? <TickIcon /> : <LinkIcon />}
                      </button>
                    </div>
                  )}
                </>
              ))}
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
            <button type="button" onClick={handleOpenInvoiceModal} disabled={isPending} className={actionButtonCls}>
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
            <button type="button" onClick={handleOpenInvoiceModal} disabled={isPending} className={actionButtonCls}>
              {preparingInvoice ? "Preparing…" : "Send invoice"}
            </button>
            <button type="button" onClick={() => openDrawer("payment")} disabled={isPending} className={actionButtonCls}>
              Record Payment
            </button>
            <button type="button" onClick={() => openDrawer("link")} disabled={isPending} className={actionButtonCls}>
              Payment link
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
          <button type="button" onClick={handleCancelSale} disabled={isPending} className="hover:underline disabled:opacity-50">
            Cancel Sale
          </button>
          <button type="button" onClick={handleDeleteSale} disabled={isPending} className="hover:underline disabled:opacity-50">
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
