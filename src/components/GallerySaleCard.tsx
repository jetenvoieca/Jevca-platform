"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  recordGalleryPayment,
  abandonPurchase,
  deleteGallerySale,
  forceDeleteCompletedSale,
  createGalleryCardIntent,
  recordPaymentIntent,
  getGalleryInstalmentDefault,
  type CardEntry,
  type PurchaseDetail,
} from "@/lib/actions/payments";
import {
  isValidInstalmentCount,
  MAX_INSTALMENTS,
  MIN_INSTALMENTS,
  saleBreakdown,
  splitIntoInstalments,
} from "@/lib/saleMath";
import {
  createInvoiceCardIntent,
  getInvoiceWindow,
  markInvoicePaid,
  recordInvoicePaymentIntent,
} from "@/lib/actions/invoices";
import { formatDate } from "@/lib/formatDate";
import { formatInvoiceNumber } from "@/lib/invoiceNumber";
import ConfirmDialog from "@/components/ConfirmDialog";
import InvoiceModal from "@/components/InvoiceModal";
import CertificateEmailModal from "@/components/CertificateEmailModal";
import StripeCardForm from "@/components/StripeCardForm";
import { ACTION_BUTTON_LOOK } from "@/components/ActionPanel";
import { invoiceCancelNote } from "@/lib/saleInvoice";

// Every action-panel button: the shared outlined look (ActionPanel.tsx).
const actionButtonCls = `rounded-md px-3 py-2 ${ACTION_BUTTON_LOOK}`;

// Inputs inside the sliding panel — centred text, per mockup.
const drawerInputCls =
  "min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-center text-sm placeholder:text-neutral-400 disabled:opacity-50";

const iconButtonCls =
  "shrink-0 rounded-md p-1 text-neutral-800 hover:bg-neutral-100 disabled:opacity-50";

// Which input panel the action panel slides down to reveal.
type DrawerKind = "payment" | "card";

const DRAWER_TITLE: Record<DrawerKind, string> = {
  payment: "Record Payment",
  card: "Card payment",
};

// Take Card: the full amount, or the first of N instalments.
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

// Take Card's three boxes: Full amount · [N] Instalments · per-instalment amount. Clicking a box
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
// PAID / UNPAID, or Cancelled (2026-10-14, Craig's mockup — whether
// it's been invoiced is its own column now).
export function SaleStatusBadge({ status }: { status: "ACTIVE" | "COMPLETED" | "ABANDONED" }) {
  if (status === "ABANDONED") {
    return <span className="text-sm text-neutral-400">Cancelled</span>;
  }
  return (
    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      {status === "COMPLETED" ? "PAID" : "UNPAID"}
    </span>
  );
}

// The invoice a sale is on now, if any — its one invoice not cancelled
// (see PurchaseDetail.invoices).
function liveInvoice(purchase: PurchaseDetail) {
  return purchase.invoices.find((i) => !i.cancelledAt) ?? null;
}

// "Delivery charge · Bils Boat" — names an older framing/delivery charge
// sale (2026-09-23; no longer made since 2026-10-14, when framing and
// delivery moved onto an Own location's invoice) in the summary list and
// above its own panel.
function ChargeHeading({ charge }: { charge: PurchaseDetail }) {
  return (
    <p className="mb-3 text-sm font-medium text-neutral-900">
      {CHARGE_LABEL[charge.chargeKind!]}
      {(charge.framer || charge.courier) && (
        <span className="font-normal text-neutral-500"> · {charge.framer || charge.courier}</span>
      )}
    </p>
  );
}

// A sale's figures and history: price, framing/delivery, paid and Net
// Due, then each payment and what has been sent. The top of every sale
// panel, and each line of the summary list.
function SaleFigures({ purchase }: { purchase: PurchaseDetail }) {
  const isPaid = purchase.status === "COMPLETED";
  const amounts = saleBreakdown(purchase);
  const money = (n: number) => formatMoney(n.toFixed(2), purchase.currency);
  const nextDueInstalment = purchase.payments.find((p) => p.status === "DUE") ?? null;

  return (
    <>
      <div className="flex items-end justify-between gap-4 text-sm font-medium text-neutral-900">
        <div className="space-y-0.5">
          <p>Sale price {money(amounts.salePrice)}</p>
          {amounts.framing > 0 && <p>Framing {money(amounts.framing)}</p>}
          {amounts.delivery > 0 && <p>Delivery {money(amounts.delivery)}</p>}
          {amounts.paid > 0 && <p>Paid {money(amounts.paid)}</p>}
        </div>
        <p>Net Due {money(isPaid ? 0 : amounts.balance)}</p>
      </div>

      <div className="mt-3 min-h-[1.25rem] space-y-0.5 text-xs text-neutral-500">
        {purchase.status === "ABANDONED" && (
          <p className="text-red-700">Cancelled{purchase.closedAt ? ` ${formatDate(purchase.closedAt)}` : ""}</p>
        )}
        {purchase.payments
          .filter((p) => p.status === "PAID")
          .map((p) => (
            <p key={p.id}>
              Paid {formatMoney(p.amount, p.currency)}
              {p.paidDate ? ` ${formatDate(p.paidDate)}` : ""}
              {p.method ? ` · ${p.method}` : ""}
            </p>
          ))}
        {purchase.type === "INSTALMENTS" && !isPaid && purchase.instalmentCount && nextDueInstalment && (
          <p>
            Paying by {purchase.instalmentCount} instalments of{" "}
            {formatMoney(nextDueInstalment.amount, nextDueInstalment.currency)}
          </p>
        )}
        {purchase.invoices.map((invoice) => {
          const label = `${invoice.paidAt ? "Receipt" : "Invoice"} ${formatInvoiceNumber(invoice.number)}`;
          if (invoice.cancelledAt) {
            return (
              <p key={invoice.id}>
                Invoice {formatInvoiceNumber(invoice.number)} cancelled {formatDate(invoice.cancelledAt)}
              </p>
            );
          }
          return (
            <div key={invoice.id}>
              <p>
                {label} · {formatDate(invoice.createdAt)}
                {invoice.saleCount > 1 && ` · ${invoice.saleCount} sales`}
              </p>
              {invoice.emailedAt && <p>Invoice sent {formatDate(invoice.emailedAt)}</p>}
              {invoice.receiptEmailedAt && <p>Receipt sent {formatDate(invoice.receiptEmailedAt)}</p>}
            </div>
          );
        })}
        {purchase.certificateEmailedAt && (
          <p>Certificate of authenticity sent {formatDate(purchase.certificateEmailedAt)}</p>
        )}
      </div>
    </>
  );
}

type CardProps = {
  purchase: PurchaseDetail;
  siteId: string;
  // Offered in the Record Payment Method dropdown (Settings-editable).
  paymentMethods: string[];
  // Called after any action that changes this sale; the caller re-fetches.
  onChanged: () => void;
  // How it was opened on its Location (2026-10-14, Craig's mockups — the
  // same for Gallery and Own locations): "image" (its Consigned Works
  // picture) is read only — just the figures; "line" (its row on the
  // Sales tab) adds View invoice, taking payment — Take Card and Record
  // Payment, which pay its whole invoice if it's on one — or, once paid,
  // the Certificate of Authenticity, and Cancel / Delete. Invoices (and
  // an Own location's framing and delivery) are produced from the Sales
  // tab's tick boxes.
  view: "image" | "line";
};

// One GALLERY-channel (consigned) sale on its Location — the only place
// it's managed (2026-10-14), shown as CardProps.view says; a cancelled
// one only when opened from its Sales-tab line, to delete it. Elsewhere
// a consigned sale is shown read-only (ConsignedSaleSummary).
//
// A sale with no (older) framing/delivery charge sales shows its panel
// straight away. Once it has any (2026-09-23 mockup), it first shows a
// summary list — the sale, then each charge — and clicking a line opens
// just that one's panel. Which one is open (`focusedId`, null for the
// summary) is held by the caller, so clicking the sale modal's header
// can return to the summary (see SaleHeader's onTitleClick). A focus
// that no longer exists (e.g. a charge just deleted) shows the summary.
// A caller with no header to click back from can leave both out; the
// card then keeps the focus itself.
export default function GallerySaleCard({
  focusedId,
  onFocusChange,
  ...props
}: CardProps & {
  focusedId?: string | null;
  onFocusChange?: (id: string | null) => void;
}) {
  const { purchase } = props;
  const [ownFocus, setOwnFocus] = useState<string | null>(null);
  const focus = onFocusChange ? (focusedId ?? null) : ownFocus;
  const setFocus = onFocusChange ?? setOwnFocus;
  const liveCharges = purchase.charges.filter((c) => c.status !== "ABANDONED");

  if (liveCharges.length === 0) return <SalePanel {...props} />;

  if (focus === purchase.id) return <SalePanel key={purchase.id} {...props} />;

  const focusedCharge = liveCharges.find((c) => c.id === focus);
  if (focusedCharge) {
    return (
      <div>
        <ChargeHeading charge={focusedCharge} />
        <SalePanel key={focusedCharge.id} {...props} purchase={focusedCharge} />
      </div>
    );
  }

  return (
    <div className="-mx-2 divide-y divide-neutral-200">
      {[purchase, ...liveCharges].map((p) => (
        <div
          key={p.id}
          role="button"
          tabIndex={0}
          onClick={() => setFocus(p.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setFocus(p.id);
            }
          }}
          className="cursor-pointer rounded-md px-2 py-4 first:pt-1 hover:bg-neutral-50"
        >
          {p.chargeKind && <ChargeHeading charge={p} />}
          <SaleFigures purchase={p} />
        </div>
      ))}
    </div>
  );
}

// A consigned sale shown outside its Location (2026-10-14 — the Sales
// page, Consolidated Sales, Inbox): its figures and those of its
// framing/delivery charges, with no actions. It's managed only from its
// Location.
export function ConsignedSaleSummary({ purchase }: { purchase: PurchaseDetail }) {
  const liveCharges = purchase.charges.filter((c) => c.status !== "ABANDONED");
  return (
    <div className="divide-y divide-neutral-200">
      {[purchase, ...liveCharges].map((p) => (
        <div key={p.id} className="py-4 first:pt-0">
          {p.chargeKind && <ChargeHeading charge={p} />}
          <SaleFigures purchase={p} />
        </div>
      ))}
    </div>
  );
}

// One sale's panel: its figures, a sliding input panel (Record Payment
// or Take Card) and its actions, as CardProps.view says.
function SalePanel({ purchase, siteId, paymentMethods, onChanged, view }: CardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ---- Invoice / receipt window ----
  const [invoiceModalId, setInvoiceModalId] = useState<string | null>(null);

  // ---- Certificate of Authenticity ----
  const [showCertificateModal, setShowCertificateModal] = useState(false);

  // ---- Sliding input panel ----
  // drawerKind keeps the last-opened panel's content in place while it
  // animates closed; drawerOpen drives the slide itself.
  const [drawerKind, setDrawerKind] = useState<DrawerKind>("payment");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Record Payment
  const [payDate, setPayDate] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("");

  // Take Card
  const [instalmentCount, setInstalmentCount] = useState("");
  const [cardOption, setCardOption] = useState<AmountOption | null>(null);
  const [cardIntent, setCardIntent] = useState<CardEntry | null>(null);

  // Paying the sale's whole invoice — what it comes to.
  const [invoiceDue, setInvoiceDue] = useState<{ balance: string; currency: string; sales: number } | null>(null);

  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const isPaid = purchase.status === "COMPLETED";
  const isCancelled = purchase.status === "ABANDONED";
  const isCharge = purchase.chargeKind !== null;
  const isLine = view === "line";
  // On an unpaid invoice, Take Card / Record Payment pay this work in full
  // on a gallery's invoice (paid work by work, 2026-10-20), and the whole
  // invoice on any other (the invoice window has no payment buttons).
  const invoice = liveInvoice(purchase);
  const unpaidInvoice = invoice && !invoice.paidAt ? invoice : null;
  const payingWork = unpaidInvoice && purchase.location?.kind === "GALLERY" ? unpaidInvoice : null;
  const payingInvoice = unpaidInvoice && !payingWork ? unpaidInvoice : null;
  const liveCharges = purchase.charges.filter((c) => c.status !== "ABANDONED");
  const onInstalmentPlan = purchase.type === "INSTALMENTS";
  const balance = isPaid ? 0 : saleBreakdown(purchase).balance;
  const money = (n: number) => formatMoney(n.toFixed(2), purchase.currency);

  const count = parseInt(instalmentCount, 10);
  const countValid = isValidInstalmentCount(count);
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
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod(paymentMethods[0] || "");
    setCardOption(null);
    setCardIntent(null);
    if (payingInvoice) {
      // The whole invoice: shows what it comes to, and for a card sets up
      // Stripe's card form for that amount straight away.
      setInvoiceDue(null);
      startTransition(async () => {
        const data = await getInvoiceWindow(payingInvoice.id);
        if (data) setInvoiceDue({ balance: data.balance, currency: data.currency, sales: data.sales.length });
        if (kind !== "card") return;
        const res = await createInvoiceCardIntent(payingInvoice.id);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setCardIntent({
          clientSecret: res.clientSecret,
          publishableKey: res.publishableKey,
          stripeAccount: res.stripeAccount,
        });
      });
    } else if (kind === "payment") {
      setPayAmount(balance.toFixed(2));
    } else if (payingWork) {
      // This work in full, so the card form is set up straight away.
      handleChooseCard("full");
    } else if (!instalmentCount) {
      getGalleryInstalmentDefault(purchase.id).then((n) => setInstalmentCount(String(n)));
    }
    setDrawerOpen(true);
  };

  const refresh = () => {
    onChanged();
    router.refresh();
  };

  const handleRecordPayment = () => {
    const fd = new FormData();
    fd.set("paidDate", payDate);
    fd.set("amount", payAmount.trim());
    fd.set("method", payMethod);
    setError(null);
    startTransition(async () => {
      const res = payingInvoice
        ? await markInvoicePaid(payingInvoice.id, fd)
        : await recordGalleryPayment(purchase.id, siteId, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDrawerOpen(false);
      refresh();
    });
  };

  // Clicking an option box sets up Stripe's card form for that amount.
  const handleChooseCard = (option: AmountOption) => {
    if (option === "instalments" && !countValid) {
      setError(`Enter a number of instalments between ${MIN_INSTALMENTS} and ${MAX_INSTALMENTS}.`);
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
      setCardIntent({
        clientSecret: res.clientSecret,
        publishableKey: res.publishableKey,
        stripeAccount: res.stripeAccount,
      });
    });
  };

  const handleCardDone = () => {
    setDrawerOpen(false);
    setCardIntent(null);
    refresh();
  };

  // A new count means a different instalment amount, so a card form on
  // screen no longer applies until the box is clicked again.
  const handleCountChange = (value: string) => {
    setInstalmentCount(value.replace(/\D/g, "").slice(0, 2));
    if (cardOption === "instalments") {
      setCardOption(null);
      setCardIntent(null);
    }
  };

  const saleNoun = isCharge ? "charge" : "sale";

  const handleCancelSale = () => {
    setPendingConfirm({
      title: `Cancel this ${saleNoun}?`,
      message: isPaid
        ? `This ${saleNoun} has been paid. Cancelling keeps it on record, marked as cancelled — any refund has to be made outside the app.`
        : `It'll be kept in the history, marked as cancelled.${invoiceCancelNote(purchase)}`,
      confirmLabel: `Cancel ${saleNoun}`,
      danger: true,
      onConfirm: () => {
        setPendingConfirm(null);
        setError(null);
        startTransition(async () => {
          const res = await abandonPurchase(purchase.id, siteId);
          if (!res.ok) setError(res.error);
          refresh();
        });
      },
    });
  };

  const handleDeleteSale = () => {
    const chargesNote =
      liveCharges.length > 0 ? " Its framing/delivery charges are deleted with it." : "";
    const message = isPaid
      ? `This ${saleNoun} has been paid. Deleting removes it and its payments from your records entirely, permanently — including from your accounts. Only do this for test or clearly wrong data, never for a real transaction.${chargesNote}`
      : `This removes the ${saleNoun} entirely — it cannot be undone.${chargesNote}${invoiceCancelNote(purchase)}`;
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
          refresh();
        });
      },
    });
  };

  return (
    <div>
      <SaleFigures purchase={purchase} />

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
              {payingInvoice
                ? `Pay invoice ${formatInvoiceNumber(payingInvoice.number)}${
                    invoiceDue
                      ? ` — ${formatMoney(invoiceDue.balance, invoiceDue.currency)}${
                          invoiceDue.sales > 1 ? ` for ${invoiceDue.sales} sales` : ""
                        }`
                      : ""
                  }`
                : payingWork
                  ? `This work in full — ${money(balance)} (invoice ${formatInvoiceNumber(payingWork.number)})`
                  : DRAWER_TITLE[drawerKind]}
            </p>

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
                {/* A whole invoice, or a work on a gallery's invoice, is
                    paid in full, so no amount to type. */}
                {!unpaidInvoice && (
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
                )}
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

            {drawerKind === "card" && payingInvoice && (
              <div className="mt-4">
                {cardIntent ? (
                  <StripeCardForm
                    key={cardIntent.clientSecret}
                    clientSecret={cardIntent.clientSecret}
                    publishableKey={cardIntent.publishableKey}
                    stripeAccount={cardIntent.stripeAccount}
                    onSucceeded={(paymentIntentId) => recordInvoicePaymentIntent(payingInvoice.id, paymentIntentId)}
                    onDone={handleCardDone}
                  />
                ) : (
                  <p className="text-center text-sm text-neutral-400">Preparing card form…</p>
                )}
              </div>
            )}

            {drawerKind === "card" &&
              !payingInvoice &&
              (onInstalmentPlan ? (
                <p className="mt-3 text-center text-sm text-neutral-500">
                  This sale is already being paid by instalments through Stripe.
                </p>
              ) : (
                <>
                  {/* A work on a gallery's invoice is paid in full — no
                      choice of amount. */}
                  {!payingWork && (
                    <AmountOptions
                      balanceLabel={money(balance)}
                      perInstalmentLabel={perInstalment !== null ? money(perInstalment) : "—"}
                      instalmentCount={instalmentCount}
                      onCountChange={handleCountChange}
                      selected={cardOption}
                      onSelect={handleChooseCard}
                      disabled={isPending}
                    />
                  )}
                  {cardOption && (
                    <div className="mt-4">
                      {cardIntent ? (
                        <StripeCardForm
                          key={cardIntent.clientSecret}
                          clientSecret={cardIntent.clientSecret}
                          publishableKey={cardIntent.publishableKey}
                          stripeAccount={cardIntent.stripeAccount}
                          onSucceeded={(paymentIntentId) => recordPaymentIntent(purchase.id, paymentIntentId)}
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

      {/* ---- Actions (line view only — the picture view is read only) ---- */}
      {isLine && (
        <>
          {/* The sale's invoice, to see it while recording the payment. */}
          {invoice && (
            <button
              type="button"
              onClick={() => setInvoiceModalId(invoice.id)}
              disabled={isPending}
              className="mt-4 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              View {invoice.paidAt ? "receipt" : "invoice"} {formatInvoiceNumber(invoice.number)}
            </button>
          )}

          {purchase.status === "ACTIVE" ? (
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-[#F9F6EE] p-3">
              <button type="button" onClick={() => openDrawer("card")} disabled={isPending} className={actionButtonCls}>
                Take Card
              </button>
              <button type="button" onClick={() => openDrawer("payment")} disabled={isPending} className={actionButtonCls}>
                Record Payment
              </button>
            </div>
          ) : isPaid && !isCharge ? (
            <div className="mt-4 grid grid-cols-1 gap-2 rounded-lg bg-[#F9F6EE] p-3">
              <button
                type="button"
                onClick={() => setShowCertificateModal(true)}
                disabled={isPending}
                className={actionButtonCls}
              >
                Certificate of Authenticity
              </button>
            </div>
          ) : null}

          {/* A cancelled sale can only be deleted. */}
          <div className={`mt-6 grid text-center text-sm text-red-700 ${isCancelled ? "grid-cols-1" : "grid-cols-2"}`}>
            {!isCancelled && (
              <button type="button" onClick={handleCancelSale} disabled={isPending} className="hover:underline disabled:opacity-50">
                {isCharge ? "Cancel Charge" : "Cancel Sale"}
              </button>
            )}
            <button type="button" onClick={handleDeleteSale} disabled={isPending} className="hover:underline disabled:opacity-50">
              {isCharge ? "Delete Charge" : "Delete Sale"}
            </button>
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

      {invoiceModalId && (
        <InvoiceModal invoiceId={invoiceModalId} onClose={() => setInvoiceModalId(null)} onChanged={refresh} />
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
