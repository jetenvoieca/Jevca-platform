"use client";

import { useEffect, useState, useTransition } from "react";
import { recordPastSale } from "@/lib/actions/payments";
import StripeCardForm from "@/components/StripeCardForm";

// Panel tint colours (2026-09-11, direct request — "payment panels need
// to be subtly different from the details part") — this whole component
// is the one thing that gets this treatment; the surrounding Catalogue
// tab stays its ordinary white/neutral palette, so the sale flow reads
// as visually distinct the moment it opens. Kept as literal Tailwind
// arbitrary-value classes throughout (not built from these via template
// strings) — Tailwind's compiler only picks up class names that appear
// as literal text in the source, so an interpolated `bg-[${x}]` would
// silently produce no CSS at all.
const PANEL_BG = "#F9F6EE";
const PANEL_TEXT = "#5E5E5E";

// Vertical padding cut ~20% (2026-09-11, direct request — "catalogue
// will be a high usage area"), same treatment as ArtworkCatalogueFields'
// shared inputCls and ArtworkDetailPanel's fields/buttons. Text colour
// matches the rest of this panel (PANEL_TEXT above).
const boxCls =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-[6.4px] text-center text-sm text-[#5E5E5E] placeholder:text-[#5E5E5E]/60";

// Filled button style used for every actual action button in this panel
// (Get payment link, Enter card now, Record sale) — deliberately
// identical for all three, replacing the previous mixed filled/outlined
// look, per direct request.
const buttonCls =
  "rounded-md bg-[#5E5E5E] px-4 py-[6.4px] text-sm font-medium text-[#F9F6EE] hover:opacity-90 disabled:opacity-50";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

// The "Sold" sale panel — opens right under Size/Location (see
// ArtworkCatalogueFields' afterLocation slot) when the Available/SOLD
// toggle further down the form is switched to SOLD. Only ever rendered
// while the artwork is genuinely still AVAILABLE — see the "Availability
// model" note in lib/actions/payments.ts. Nothing this panel does can
// leave the artwork in a state this panel itself can't correctly
// display, and once a sale is committed (RESERVED or SOLD), this panel
// simply doesn't render again — the Catalogue tab's Availability area
// shows plain static text instead, and managing/cancelling that sale
// happens from the Sales page.
//
// Enter card now switches this panel into "card" mode — telephone-sale
// card entry, no customer personalisation needed (direct instruction:
// "this is only used for telephone sales"). Repositioning the whole
// panel up to sit right under Name/Tier while in card mode is handled
// one level up, in ArtworkDetailPanel (this component doesn't know
// about Type/Group/Medium/Size/Location at all).
//
// Record sale swaps this same panel — still in its normal afterLocation
// position, no repositioning like card mode — for a simple
// Price/Currency/Date paid/Source/Name/Email/Address form.
//
// Get payment link/Enter card now call the real actions in
// lib/actions/payments.ts, but entirely from ArtworkDetailPanel, not
// here — deposit/date paid/purchase option/name/email/link URL/card
// secret/the action's own pending+error state are all controlled from
// the parent, since switching into card mode renders a structurally
// different branch of the parent's JSX (a genuinely new instance of
// this component), and local state — including an in-flight fetch's own
// local useState — would otherwise be silently dropped by that remount.
// Record mode never remounts (it's rendered from the same branch as
// sale mode), so its own fields and action stay simple and local.
//
// Tinted "payment panel" styling — the whole panel background is
// #F9F6EE, all its own text is #5E5E5E, and every actual action button
// (Get payment link, Enter card now, Record sale) is filled #5E5E5E
// with #F9F6EE text.
//
// Back/Close (2026-09-20 rebuild) — every Back or X in this panel is now
// a plain, local step with no server call at all: onClose (sale/record
// modes) just collapses the panel, since nothing is committed until one
// of the three action buttons actually succeeds; onBackToSale (card
// mode) is only reachable before a Purchase has been started (still
// preparing, or the start itself failed) — once card entry is genuinely
// under way (cardSecret present), the sale is already RESERVED and
// there's nothing left to "go back" from; the panel just shows the card
// form with no Back/Close at all, and leaving it (closing the whole
// artwork modal) is fine, since RESERVED already correctly reflects
// what's happening. Cancel sale/Delete are gone entirely from this
// panel for the same reason — cancelling a committed sale happens from
// the Sales page now, not here.
export default function ArtworkSalePanel({
  artworkId,
  siteId,
  offeredPrice,
  currency,
  defaultInstalmentCount,
  saleSources,
  purchaseId,
  mode,
  depositPaid,
  onDepositPaidChange,
  datePaid,
  onDatePaidChange,
  option,
  onOptionChange,
  buyerName,
  onBuyerNameChange,
  buyerEmail,
  onBuyerEmailChange,
  linkUrl,
  cardSecret,
  cardPublishableKey,
  actionPending,
  actionError,
  onGetPaymentLink,
  onEnterCardClick,
  onClose,
  onBackToSale,
  onRecordSale,
  onBackFromRecord,
  onSaleCompleted,
}: {
  artworkId: string;
  siteId: string;
  offeredPrice: string | null;
  currency: string;
  defaultInstalmentCount: number;
  saleSources: string[];
  // The Purchase this panel is currently working with, once Enter card
  // now has actually started one — passed through to StripeCardForm,
  // which needs it to record a confirmed payment directly rather than
  // relying solely on the Stripe webhook (see StripeCardForm's own
  // note). Null before that.
  purchaseId: string | null;
  // "sale" — the normal Deposit paid/Purchase option/Name/Email/3-button
  // view. "card" — the telephone-sale card entry view, entered via
  // Enter card now. "record" — the simple record-a-sale form, entered
  // via Record sale.
  mode: "sale" | "card" | "record";
  depositPaid: string;
  onDepositPaidChange: (value: string) => void;
  datePaid: string;
  onDatePaidChange: (value: string) => void;
  option: "full" | "instalments";
  onOptionChange: (value: "full" | "instalments") => void;
  buyerName: string;
  onBuyerNameChange: (value: string) => void;
  buyerEmail: string;
  onBuyerEmailChange: (value: string) => void;
  // Result of Get payment link, owned by the parent — see the
  // file-level note above.
  linkUrl: string | null;
  // Result of Enter card now, owned by the parent.
  cardSecret: string | null;
  cardPublishableKey: string | null;
  // Covers Get payment link/Enter card now — owned by the parent.
  actionPending: boolean;
  actionError: string | null;
  onGetPaymentLink: () => void;
  onEnterCardClick: () => void;
  // Sale/record modes' Back and X, both the same plain local reset —
  // nothing has been committed yet in either mode until one of the
  // action buttons actually succeeds (2026-09-20 rebuild).
  onClose: () => void;
  // Card mode's own Back — only shown before a Purchase has actually
  // started (still preparing, or the start failed); once it succeeds,
  // the sale is committed and this is never shown again.
  onBackToSale: () => void;
  // Switches this panel into record mode (sale mode's "Record sale"
  // button).
  onRecordSale: () => void;
  // Back out of record mode, to sale mode (record mode's own Back).
  onBackFromRecord: () => void;
  // Fired once a sale is genuinely done — a card payment confirmed, or
  // Record sale submitted successfully. The parent refreshes the
  // artwork (picking up the now-SOLD availability) and closes the whole
  // panel.
  onSaleCompleted: () => void;
}) {
  const [recordPrice, setRecordPrice] = useState("");
  const [recordCurrency, setRecordCurrency] = useState(currency);
  const [recordDatePaid, setRecordDatePaid] = useState("");
  const [recordSource, setRecordSource] = useState("");
  const [recordAddress, setRecordAddress] = useState("");
  const [recordError, setRecordError] = useState<string | null>(null);
  // Record mode's own pending/action — local is fine here (unlike Get
  // payment link/Enter card now above) since record mode never remounts
  // this component; it's rendered from the same branch as sale mode.
  const [recordPending, startRecordTransition] = useTransition();

  // Slide-up entrance (direct request — "sale panel slides up into
  // view") — starts a touch below/faded and animates to its resting
  // position right after mount, rather than just popping in. Re-triggers
  // on mode change too, so switching mode gets its own small "slides up
  // further" motion, not just the initial open.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    const t = setTimeout(() => setShown(true), 10);
    return () => clearTimeout(t);
  }, [mode]);

  // Full payment defaults to the Offered price; a recorded deposit
  // reduces both the full-payment figure and each instalment (direct
  // request) — both options are simply the remaining balance after the
  // deposit, split differently.
  const offered = parseFloat(offeredPrice || "") || 0;
  const deposit = parseFloat(depositPaid || "") || 0;
  const remaining = Math.max(offered - deposit, 0);
  const instalmentCount = defaultInstalmentCount || 2;
  const perInstalment = instalmentCount ? remaining / instalmentCount : remaining;

  const cardCls = (active: boolean) =>
    `rounded-md border px-4 py-[9.6px] text-left text-sm ${
      active ? "border-2 border-[#5E5E5E]" : "border-neutral-300 hover:border-neutral-400"
    }`;

  const handleRecordSale = () => {
    if (!recordPrice.trim()) {
      setRecordError("Price is required.");
      return;
    }
    if (!recordDatePaid.trim()) {
      setRecordError("Date paid is required.");
      return;
    }
    setRecordError(null);
    const fd = new FormData();
    fd.set("buyerName", buyerName.trim());
    fd.set("buyerEmail", buyerEmail.trim());
    fd.set("buyerAddress", recordAddress.trim());
    fd.set("totalAmount", recordPrice.trim());
    fd.set("currency", recordCurrency);
    fd.set("source", recordSource);
    fd.set("saleDate", recordDatePaid);
    startRecordTransition(async () => {
      const result = await recordPastSale(artworkId, siteId, fd);
      if (!result.ok) {
        setRecordError(result.error);
        return;
      }
      onSaleCompleted();
    });
  };

  // Card mode has genuinely committed once a client secret is in hand —
  // from that point there's no Back/Close shown at all (see the
  // component-level note above).
  const cardCommitted = mode === "card" && !!(cardSecret && cardPublishableKey && purchaseId);
  const showBackCloseRow = mode !== "card" || !cardCommitted;
  const backHandler = mode === "sale" ? onClose : mode === "card" ? onBackToSale : onBackFromRecord;

  return (
    <div
      style={{ backgroundColor: PANEL_BG, color: PANEL_TEXT }}
      className={`space-y-4 rounded-lg p-4 transition-all duration-300 ease-out ${
        shown ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
      }`}
    >
      {showBackCloseRow && (
        <div className="flex items-center justify-between">
          <button type="button" onClick={backHandler} className="text-sm hover:underline">
            ← Back
          </button>
          <button
            type="button"
            onClick={mode === "card" ? onBackToSale : onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-black/5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {mode === "record" ? (
        // Simple record-a-sale form — replaces the whole Deposit paid/
        // Purchase option/3-button sale card. Calls the same
        // recordPastSale action the gallery-sale backfill already uses,
        // with commissionPercent left unset (always 0% for a direct
        // sale here, per direct instruction).
        <>
          <div className="grid grid-cols-3 gap-3">
            <input
              type="text"
              inputMode="decimal"
              value={recordPrice}
              onChange={(e) => setRecordPrice(e.target.value)}
              placeholder="Price"
              className={boxCls}
            />
            <select
              value={recordCurrency}
              onChange={(e) => setRecordCurrency(e.target.value)}
              className={boxCls}
            >
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
            </select>
            <input
              type="date"
              value={recordDatePaid}
              onChange={(e) => setRecordDatePaid(e.target.value)}
              placeholder="Date paid"
              className={boxCls}
            />
          </div>

          <select
            value={recordSource}
            onChange={(e) => setRecordSource(e.target.value)}
            className={boxCls}
          >
            <option value="">Source</option>
            {saleSources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={buyerName}
            onChange={(e) => onBuyerNameChange(e.target.value)}
            placeholder="Name"
            className={boxCls}
          />
          <input
            type="email"
            value={buyerEmail}
            onChange={(e) => onBuyerEmailChange(e.target.value)}
            placeholder="Email"
            className={boxCls}
          />
          <textarea
            value={recordAddress}
            onChange={(e) => setRecordAddress(e.target.value)}
            placeholder="Address"
            rows={3}
            className={boxCls}
          />

          {recordError && <p className="text-sm text-red-600">{recordError}</p>}

          <button
            type="button"
            onClick={handleRecordSale}
            disabled={recordPending}
            className={`w-full ${buttonCls}`}
          >
            {recordPending ? "Recording…" : "Record sale"}
          </button>
        </>
      ) : mode === "sale" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              inputMode="decimal"
              value={depositPaid}
              onChange={(e) => onDepositPaidChange(e.target.value)}
              placeholder="Deposit paid"
              className={boxCls}
            />
            <input
              type="date"
              value={datePaid}
              onChange={(e) => onDatePaidChange(e.target.value)}
              placeholder="Date paid"
              className={boxCls}
            />
          </div>

          <div>
            <p className="mb-1 text-sm font-medium">Purchase option</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onOptionChange("full")}
                className={cardCls(option === "full")}
              >
                <p className="font-medium">Full payment</p>
                <p>{formatMoney(remaining, currency)}</p>
              </button>
              <button
                type="button"
                onClick={() => onOptionChange("instalments")}
                className={cardCls(option === "instalments")}
              >
                <p className="font-medium">{instalmentCount} instalments</p>
                <p>
                  {formatMoney(remaining, currency)} ({formatMoney(perInstalment, currency)} each)
                </p>
              </button>
            </div>
          </div>

          <input
            type="text"
            value={buyerName}
            onChange={(e) => onBuyerNameChange(e.target.value)}
            placeholder="Name"
            className={boxCls}
          />
          <input
            type="email"
            value={buyerEmail}
            onChange={(e) => onBuyerEmailChange(e.target.value)}
            placeholder="Email"
            className={boxCls}
          />

          {actionError && <p className="text-sm text-red-600">{actionError}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onGetPaymentLink}
              disabled={actionPending}
              className={`flex-1 ${buttonCls}`}
            >
              {actionPending ? "Working…" : "Get payment link"}
            </button>
            <button
              type="button"
              onClick={onEnterCardClick}
              disabled={actionPending}
              className={`flex-1 ${buttonCls}`}
            >
              Enter card now
            </button>
            <button type="button" onClick={onRecordSale} className={`flex-1 ${buttonCls}`}>
              Record sale
            </button>
          </div>

          {linkUrl && (
            <div className="rounded-md bg-white/60 p-3">
              <p className="mb-1 text-xs">
                Send this link to the buyer (copy and paste — nothing is emailed automatically).
                This artwork is now Sold - Not Paid:
              </p>
              <input
                readOnly
                value={linkUrl}
                onFocus={(e) => e.target.select()}
                className="w-full rounded border border-neutral-300 bg-white px-2 py-[3.2px] text-xs"
              />
            </div>
          )}
        </>
      ) : (
        // Card entry — telephone sale, no customer personalisation
        // (direct instruction). Renders the real Stripe Elements form
        // once a client secret comes back from the parent (see the
        // file-level note on why this state lives there). Once it does,
        // the sale is already committed (RESERVED) — no Back/Close, no
        // Cancel/Delete; the Sales page is where this sale gets managed
        // from here on.
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <rect x="2" y="9" width="20" height="3" fill="currentColor" />
            </svg>
            Card
          </div>

          {cardCommitted ? (
            <>
              <StripeCardForm
                clientSecret={cardSecret!}
                publishableKey={cardPublishableKey!}
                purchaseId={purchaseId!}
                onDone={onSaleCompleted}
              />
              <p className="text-xs">
                This artwork is now Sold - Not Paid while the card is processed. If you need to
                cancel this sale, do that from the Sales page.
              </p>
            </>
          ) : (
            <>
              {actionError && <p className="text-sm text-red-600">{actionError}</p>}
              <p className="text-sm">{actionPending ? "Preparing card entry…" : "—"}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
