"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  recordGalleryPayment,
  abandonPurchase,
  deleteGallerySale,
  forceDeleteCompletedSale,
  createGalleryPaymentLink,
  createGalleryCardIntent,
  getGalleryInstalmentDefault,
  saveSaleExtra,
  type PurchaseDetail,
} from "@/lib/actions/payments";
import { saleBreakdown, splitIntoInstalments } from "@/lib/saleMath";
import { formatDate } from "@/lib/formatDate";
import ConfirmDialog from "@/components/ConfirmDialog";
import InvoiceEmailModal from "@/components/InvoiceEmailModal";
import CertificateEmailModal from "@/components/CertificateEmailModal";
import StripeCardForm from "@/components/StripeCardForm";

// Every action-panel button: #5E5E5E with #F9F6EE text.
const actionButtonCls =
  "rounded-md bg-[#5E5E5E] px-3 py-2 text-sm text-[#F9F6EE] hover:bg-[#4a4a4a] disabled:opacity-50";

// Inputs inside the sliding panel — centred text, per mockup.
const drawerInputCls =
  "min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-center text-sm placeholder:text-neutral-400 disabled:opacity-50";

const iconButtonCls =
  "shrink-0 rounded-md p-1 text-neutral-800 hover:bg-neutral-100 disabled:opacity-50";

// Which input panel the action panel slides down to reveal.
type DrawerKind = "framing" | "delivery" | "payment" | "link" | "card";

const DRAWER_TITLE: Record<DrawerKind, string> = {
  framing: "Arrange Framing",
  delivery: "Arrange Delivery",
  payment: "Record Payment",
  link: "Stripe payment link",
  card: "Card payment",
};

// Full amount, or the first of N instalments — chosen the same way for
// a payment link and for Take Card.
type AmountOption = "full" | "instalments";

const CHARGE_LABEL: Record<"FRAMING" | "DELIVERY", string> = {
  FRAMING: "Framing charge",
  DELIVERY: "Delivery charge",
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

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" strokeLinecap="round" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" strokeLinecap="round" />
    </svg>
  );
}

// The three boxes shared by the payment link and Take Card panels:
// Full amount · [N] Instalments · per-instalment amount. Clicking a box
// selects that option; the count is typed straight into the middle box.
function AmountOptions({
  balanceLabel,
  perInstalmentLabel,
  instalmentCount,
  onCountChange,
  selected,
  onSelect,
  disabled,
}: {
  balanceLabel: string;
  perInstalmentLabel: string;
  instalmentCount: string;
  onCountChange: (value: string) => void;
  selected: AmountOption | null;
  onSelect: (option: AmountOption) => void;
  disabled: boolean;
}) {
  const boxCls = (on: boolean) =>
    `flex flex-col items-center justify-center rounded-lg border px-2 py-2 text-center leading-tight ${
      on ? "border-neutral-900 text-neutral-900" : "border-neutral-300 text-neutral-500 hover:border-neutral-500"
    }`;
  return (
    <div className="mt-3 grid grid-cols-3 gap-3">
      <button type="button" onClick={() => onSelect("full")} disabled={disabled} className={boxCls(selected === "full")}>
        <span className="text-sm">Full amount</span>
        <span className="text-base">{balanceLabel}</span>
      </button>
      <label className={`cursor-text ${boxCls(selected === "instalments")}`}>
        <input
          type="text"
          inputMode="numeric"
          value={instalmentCount}
          onChange={(e) => onCountChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSelect("instalments")}
          disabled={disabled}
          aria-label="Number of instalments"
          className="w-12 rounded border border-transparent bg-transparent text-center text-base text-neutral-900 hover:border-neutral-200 focus:border-neutral-400 focus:outline-none"
        />
        <span className="text-sm">Instalments</span>
      </label>
      <button
        type="button"
        onClick={() => onSelect("instalments")}
        disabled={disabled}
        className={boxCls(selected === "instalments")}
      >
        <span className="text-sm">Instalments</span>
        <span className="text-base">{perInstalmentLabel}</span>
      </button>
    </div>
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
// and sends), a sliding input panel, the Action panel, Cancel/Delete,
// and then any framing/delivery charge sales arranged after payment —
// each shown with this same card (a charge has no Arrange buttons and
// no certificate). ABANDONED sales never come here — callers show
// SaleDetailCard for those.
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

  // Stripe payment link / Take Card — the instalment count is shared
  const [instalmentCount, setInstalmentCount] = useState("");
  const [linkOption, setLinkOption] = useState<AmountOption | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [cardOption, setCardOption] = useState<AmountOption | null>(null);
  const [cardIntent, setCardIntent] = useState<{ clientSecret: string; publishableKey: string } | null>(
    null
  );

  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const isPaid = purchase.status === "COMPLETED";
  const isCharge = purchase.chargeKind !== null;
  const liveCharges = purchase.charges.filter((c) => c.status !== "ABANDONED");
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
      // At most one of each — clicking again edits it. Before payment it
      // lives on this sale; after payment it's its own charge sale.
      if (isPaid) {
        const charge = liveCharges.find((c) => c.chargeKind === (kind === "framing" ? "FRAMING" : "DELIVERY"));
        setExtraName((kind === "framing" ? charge?.framer : charge?.courier) ?? "");
        setExtraCost(charge?.totalAmount ?? "");
      } else {
        setExtraName((kind === "framing" ? purchase.framer : purchase.courier) ?? "");
        setExtraCost((kind === "framing" ? purchase.framingCost : purchase.deliveryCost) ?? "");
      }
    } else if (kind === "payment") {
      setPayDate(new Date().toISOString().slice(0, 10));
      setPayAmount(balance.toFixed(2));
      setPayMethod(paymentMethods[0] || "");
    } else {
      setLinkOption(null);
      setLinkUrl(null);
      setLinkCopied(false);
      setCardOption(null);
      setCardIntent(null);
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
  const handleChooseLink = (option: AmountOption) => {
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

  // Clicking an option box sets up Stripe's card form for that amount.
  const handleChooseCard = (option: AmountOption) => {
    if (option === "instalments" && !countValid) {
      setError("Enter a number of instalments between 2 and 36.");
      return;
    }
    setError(null);
    setCardOption(option);
    setCardIntent(null);
    startTransition(async () => {
      const res = await createGalleryCardIntent(
        purchase.id,
        siteId,
        option === "instalments" ? count : undefined
      );
      if (!res.ok) {
        setError(res.error);
        setCardOption(null);
        return;
      }
      setCardIntent({ clientSecret: res.clientSecret, publishableKey: res.publishableKey });
    });
  };

  const handleCardDone = () => {
    setDrawerOpen(false);
    setCardIntent(null);
    onChanged();
    router.refresh();
  };

  // A new count means a different instalment amount, so any instalment
  // link or card form on screen no longer applies until the box is
  // clicked again.
  const handleCountChange = (value: string) => {
    setInstalmentCount(value.replace(/\D/g, "").slice(0, 2));
    if (linkOption === "instalments") {
      setLinkOption(null);
      setLinkUrl(null);
    }
    if (cardOption === "instalments") {
      setCardOption(null);
      setCardIntent(null);
    }
  };

  const handleCopyLink = () => {
    if (!linkUrl) return;
    navigator.clipboard.writeText(linkUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    });
  };

  const saleNoun = isCharge ? "charge" : "sale";

  const handleCancelSale = () => {
    setPendingConfirm({
      title: `Cancel this ${saleNoun}?`,
      message: isPaid
        ? `This ${saleNoun} has been paid. Cancelling keeps it on record, marked as cancelled — any refund has to be made outside the app.`
        : `It'll be kept in the history, marked as cancelled.`,
      confirmLabel: `Cancel ${saleNoun}`,
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
    const chargesNote =
      liveCharges.length > 0 ? " Its framing/delivery charges are deleted with it." : "";
    const message = isPaid
      ? `This ${saleNoun} has been paid. Deleting removes it and its payments from your records entirely, permanently — including from your accounts. Only do this for test or clearly wrong data, never for a real transaction.${chargesNote}`
      : purchase.invoiceNumber
        ? `An invoice (#${purchase.invoiceNumber}) was already generated for it — deleting will leave a gap in your invoice numbering, which is fine but can't be undone. This removes the ${saleNoun} entirely.${chargesNote}`
        : `This removes the ${saleNoun} entirely — it cannot be undone.${chargesNote}`;
    setPendingConfirm({
      title: `Delete this ${saleNoun} permanently?`,
      message,
      confirmLabel: "Delete permanently",
      danger: true,
      onConfirm: () => {
        setPendingConfirm(null);
        setError(null);
        startTransition(async () => {
          const res = isPaid
            ? await forceDeleteCompletedSale(purchase.id, siteId)
            : await deleteGallerySale(purchase.id, siteId);
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

  const perInstalmentLabel = perInstalment !== null ? money(perInstalment) : "—";

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
        {purchase.invoiceEmailedAt && <p>Invoice sent {formatDate(purchase.invoiceEmailedAt)}</p>}
        {purchase.receiptEmailedAt && <p>Receipt sent {formatDate(purchase.receiptEmailedAt)}</p>}
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
                  <AmountOptions
                    balanceLabel={money(balance)}
                    perInstalmentLabel={perInstalmentLabel}
                    instalmentCount={instalmentCount}
                    onCountChange={handleCountChange}
                    selected={linkOption}
                    onSelect={handleChooseLink}
                    disabled={isPending}
                  />
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

            {drawerKind === "card" &&
              (onInstalmentPlan ? (
                <p className="mt-3 text-center text-sm text-neutral-500">
                  This sale is already being paid by instalments through Stripe.
                </p>
              ) : (
                <>
                  <AmountOptions
                    balanceLabel={money(balance)}
                    perInstalmentLabel={perInstalmentLabel}
                    instalmentCount={instalmentCount}
                    onCountChange={handleCountChange}
                    selected={cardOption}
                    onSelect={handleChooseCard}
                    disabled={isPending}
                  />
                  {cardOption && (
                    <div className="mt-4">
                      {cardIntent ? (
                        <StripeCardForm
                          key={cardIntent.clientSecret}
                          clientSecret={cardIntent.clientSecret}
                          publishableKey={cardIntent.publishableKey}
                          purchaseId={purchase.id}
                          onDone={handleCardDone}
                        />
                      ) : (
                        <p className="text-center text-sm text-neutral-400">Preparing card form…</p>
                      )}
                    </div>
                  )}
                </>
              ))}
          </div>
        </div>
      </div>

      {/* ---- Action panel ---- */}
      {/* Framing and delivery stay available after payment (they may be
          arranged later) — a charge sale itself has neither. */}
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-[#F9F6EE] p-3">
        {!isCharge && (
          <>
            <button type="button" onClick={() => openDrawer("framing")} disabled={isPending} className={actionButtonCls}>
              Arrange Framing
            </button>
            <button type="button" onClick={() => openDrawer("delivery")} disabled={isPending} className={actionButtonCls}>
              Arrange Delivery
            </button>
          </>
        )}
        {isPaid ? (
          <>
            <button type="button" onClick={handleOpenInvoiceModal} disabled={isPending} className={actionButtonCls}>
              Send Receipt
            </button>
            {!isCharge && (
              <button
                type="button"
                onClick={() => setShowCertificateModal(true)}
                disabled={isPending}
                className={actionButtonCls}
              >
                Certificate of Authenticity
              </button>
            )}
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
            <button type="button" onClick={() => openDrawer("card")} disabled={isPending} className={actionButtonCls}>
              Take Card
            </button>
          </>
        )}
      </div>

      {/* ---- Cancel / Delete ---- */}
      <div className="mt-6 grid grid-cols-2 text-center text-sm text-red-700">
        <button type="button" onClick={handleCancelSale} disabled={isPending} className="hover:underline disabled:opacity-50">
          {isCharge ? "Cancel Charge" : "Cancel Sale"}
        </button>
        <button type="button" onClick={handleDeleteSale} disabled={isPending} className="hover:underline disabled:opacity-50">
          {isCharge ? "Delete Charge" : "Delete Sale"}
        </button>
      </div>

      {/* ---- Framing / delivery charges arranged after payment ---- */}
      {liveCharges.map((charge) => (
        <div key={charge.id} className="mt-8 border-t border-neutral-200 pt-5">
          <p className="mb-3 text-sm font-medium text-neutral-900">
            {CHARGE_LABEL[charge.chargeKind!]}
            {(charge.framer || charge.courier) && (
              <span className="font-normal text-neutral-500"> · {charge.framer || charge.courier}</span>
            )}
          </p>
          <GallerySaleCard
            purchase={charge}
            siteId={siteId}
            paymentMethods={paymentMethods}
            onChanged={onChanged}
          />
        </div>
      ))}

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
