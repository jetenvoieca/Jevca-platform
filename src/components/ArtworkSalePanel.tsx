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

// The "Sold" sale panel (2026-09-10) — opens right under Size/Location
// (see ArtworkCatalogueFields' afterLocation slot) when the Availability
// toggle further down the form is switched to SOLD.
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
// Price/Currency/Date paid/Source/Name/Email/Address form, replacing
// the Deposit paid/Purchase option/3-button sale card entirely.
//
// Stripe wiring (2026-09-10) — Get payment link/Enter card now call the
// real actions in lib/actions/payments.ts (startArtworkSaleAndGetLink/
// startArtworkSaleAndEnterCard, createPaymentLink/createCardEntryIntent),
// but now entirely from ArtworkDetailPanel, not here (2026-09-11 fix —
// see the note below). Record sale still calls recordPastSale directly
// from this component, since record mode never has the remount problem
// that motivated moving the other two up.
//
// Deposit paid/Date paid/Purchase option/Name/Email/link URL/card
// secret/publishable key/the action's own pending+error state are all
// controlled from the parent (2026-09-10 fix, extended 2026-09-11) —
// switching into card mode renders a structurally different branch of
// the parent's JSX (ArtworkCatalogueFields' afterLocation slot vs. the
// card-mode branch that skips it entirely), which mounts a genuinely
// new instance of this component. Local state — including an in-flight
// fetch's own local useState — is silently dropped by that remount:
// Enter card now would kick off the real Stripe call, but the async
// callback's setCardSecret/setCardPublishableKey landed on the now-
// unmounted old instance and were discarded, leaving the freshly-
// mounted card-mode instance stuck showing "—" forever with no card
// form and no error. Lifting the fetch itself (not just its resulting
// values) up to ArtworkDetailPanel — which never unmounts across this
// switch — fixes it: the parent starts the fetch, and whichever
// instance of this component is currently rendered just displays
// whatever the parent currently holds. Record mode never remounts (it's
// rendered from the same branch as sale mode), so its own fields and
// action stay simple and local, same as before.
//
// Tinted "payment panel" styling (2026-09-11, direct request) — the
// whole panel background is #F9F6EE, all its own text is #5E5E5E, and
// every actual action button (Get payment link, Enter card now, Record
// sale) is filled #5E5E5E with #F9F6EE text, replacing the previous
// ordinary white/neutral-900/outlined look. Cancel sale/Delete stay red
// — those are destructive actions and deliberately keep their own
// distinct colour regardless of this panel's tint.
//
// Close (X) + Back, unified across all three modes (2026-09-20, direct
// request) — previously each mode had its own inconsistent scattering
// (sale had "← Back to Available", record had "← Back", card had
// neither). Now every mode gets the same top row: a Back link on the
// left, an X close icon on the right. Close always means the same thing
// everywhere — hand off to onBackToAvailable, which abandons whatever
// ACTIVE purchase this session may have started and returns all the way
// to Available. Back means "one step less committed than where I am
// now": in sale mode there's nothing less committed than Available
// itself, so Back and Close both go there; in card mode Back returns to
// the sale form without abandoning the purchase already started
// (onBackToSale) — Cancel sale (red, further down) is the one that
// actually abandons it; in record mode Back returns to the sale form
// the same way it always has (onBackFromRecord).
export default function ArtworkSalePanel({
  artworkId,
  siteId,
  offeredPrice,
  currency,
  defaultInstalmentCount,
  saleSources,
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
  onBackToAvailable,
  onBackToSale,
  onCancelCardSale,
  onDeleteCardSale,
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
  // Result of Get payment link, owned by the parent (2026-09-11) — see
  // the file-level note above.
  linkUrl: string | null;
  // Result of Enter card now, owned by the parent (2026-09-11).
  cardSecret: string | null;
  cardPublishableKey: string | null;
  // Covers Get payment link/Enter card now/Back to Available/Cancel
  // sale/Delete — all owned by the parent now (2026-09-11).
  actionPending: boolean;
  actionError: string | null;
  onGetPaymentLink: () => void;
  onEnterCardClick: () => void;
  // The X close, every mode (2026-09-20) — abandons whatever ACTIVE
  // purchase this session may have started and returns all the way to
  // Available, so nothing is left dangling in Stripe/the database just
  // because the panel was closed rather than completed. Also sale
  // mode's own Back link, since Available is the only place "back" from
  // sale mode.
  onBackToAvailable: () => void;
  // Card mode's own Back — returns to the sale form without abandoning
  // the purchase already started (2026-09-20).
  onBackToSale: () => void;
  onCancelCardSale: () => void;
  onDeleteCardSale: () => void;
  // Switches this panel into record mode (sale mode's "Record sale"
  // button).
  onRecordSale: () => void;
  // Back out of record mode, to sale mode (record mode's own Back).
  onBackFromRecord: () => void;
  // Fired once a sale is genuinely done — a card payment confirmed, or
  // Record sale submitted successfully (2026-09-10). The parent
  // refreshes the artwork (picking up the now-SOLD availability) and
  // closes the whole panel.
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

  // Slide-up entrance (2026-09-10, direct request — "sale panel slides
  // up into view") — starts a touch below/faded and animates to its
  // resting position right after mount, rather than just popping in.
  // Re-triggers on mode change too, so switching mode gets its own
  // small "slides up further" motion, not just the initial open.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    const t = setTimeout(() => setShown(true), 10);
    return () => clearTimeout(t);
  }, [mode]);

  // Full payment defaults to the Offered price; a recorded deposit
  // reduces both the full-payment figure and each instalment
  // (2026-09-10, direct request) — both options are simply the
  // remaining balance after the deposit, split differently.
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

  const backHandler =
    mode === "sale" ? onBackToAvailable : mode === "card" ? onBackToSale : onBackFromRecord;

  return (
    <div
      style={{ backgroundColor: PANEL_BG, color: PANEL_TEXT }}
      className={`space-y-4 rounded-lg p-4 transition-all duration-300 ease-out ${
        shown ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
      }`}
    >
      {/* Back (left) + Close (right), same row, every mode (2026-09-20,
          direct request). See the component-level note above for what
          each does in each mode. */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={backHandler} className="text-sm hover:underline">
          ← Back
        </button>
        <button
          type="button"
          onClick={onBackToAvailable}
          aria-label="Close"
          className="rounded-md p-1 hover:bg-black/5"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {mode === "record" ? (
        // Simple record-a-sale form (2026-09-10) — replaces the whole
        // Deposit paid/Purchase option/3-button sale card. Calls the
        // same recordPastSale action the gallery-sale backfill already
        // uses, with commissionPercent left unset (always 0% for a
        // direct sale here, per direct instruction).
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
      ) : (
        <>
          {mode === "sale" && (
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
          )}

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

          {mode === "sale" ? (
            <>
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
                    Send this link to the buyer (copy and paste — nothing is emailed
                    automatically):
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
            // (direct instruction). Renders the real Stripe Elements
            // form once a client secret comes back from the parent
            // (see the file-level note on why this state lives there).
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
                  <rect x="2" y="9" width="20" height="3" fill="currentColor" />
                </svg>
                Card
              </div>

              {cardSecret && cardPublishableKey ? (
                <>
                  <StripeCardForm
                    clientSecret={cardSecret}
                    publishableKey={cardPublishableKey}
                    onDone={onSaleCompleted}
                  />
                  <p className="text-xs">
                    Status below updates within a few seconds of Stripe confirming the charge.
                  </p>
                </>
              ) : (
                <p className="text-sm">{actionPending ? "Preparing card entry…" : "—"}</p>
              )}

              <div className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={onCancelCardSale}
                  disabled={actionPending}
                  className="text-red-600 hover:underline disabled:opacity-50"
                >
                  Cancel sale
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={onDeleteCardSale}
                  disabled={actionPending}
                  className="text-red-600 hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
