"use client";

import { useEffect, useState, useTransition } from "react";
import {
  startArtworkSaleAndGetLink,
  startArtworkSaleAndEnterCard,
  createPaymentLink,
  createCardEntryIntent,
  recordPastSale,
  abandonPurchase,
  deleteGallerySale,
} from "@/lib/actions/payments";
import StripeCardForm from "@/components/StripeCardForm";

const boxCls =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-sm placeholder:text-neutral-400";

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
// Stripe wiring (2026-09-10) — Get payment link/Enter card now/Record
// sale all now call the real actions in lib/actions/payments.ts:
// startArtworkSaleAndGetLink/startArtworkSaleAndEnterCard (which seed
// SaleTerms from Offered price minus any Deposit paid, then reuse the
// existing startPurchase/createPaymentLink/createCardEntryIntent chain
// unchanged) and recordPastSale (the same action the old gallery-sale
// backfill already used). Card entry renders the real Stripe Elements
// form (StripeCardForm) once a client secret comes back — the manual
// Card number/Expiry/Security code fields this used to show were only
// ever a layout placeholder and are gone now that there's a real,
// PCI-compliant form to use instead.
//
// Deposit paid/Date paid/Purchase option/Name/Email are controlled from
// the parent (2026-09-10 fix) rather than local useState — switching
// into card mode renders a structurally different branch of the
// parent's JSX (ArtworkCatalogueFields' afterLocation slot vs. the
// card-mode branch that skips it entirely), which mounts a genuinely
// new instance of this component; local state was silently reset by
// that remount. Record mode doesn't have this problem (same afterLocation
// slot, same instance), so its own fields stay simple local state.
export default function ArtworkSalePanel({
  artworkId,
  siteId,
  offeredPrice,
  currency,
  defaultInstalmentCount,
  saleSources,
  activePurchaseId,
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
  onBackToAvailable,
  onEnterCard,
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
  // An already-active STRIPE-channel purchase for this artwork, if one
  // exists when the panel opens (2026-09-10) — reuses it (createPaymentLink/
  // createCardEntryIntent directly) instead of trying to start a second
  // one, which startPurchase would just refuse anyway.
  activePurchaseId: string | null;
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
  // 2026-09-10 — everything below this panel (Date, Reference/Offered
  // price, the Available/SOLD toggle itself, Studio notes) is hidden
  // while the panel is open, so this link (sale mode only) takes the
  // toggle's place as the way back to Available. Now also abandons
  // whatever ACTIVE purchase this session may have started, so nothing
  // is left dangling in Stripe/the database just because the panel was
  // closed rather than completed.
  onBackToAvailable: () => void;
  // Switches this panel into card mode (sale mode's "Enter card now"
  // button).
  onEnterCard: () => void;
  // Switches this panel into record mode (sale mode's "Record sale"
  // button).
  onRecordSale: () => void;
  // Back out of record mode, to sale mode (record mode's own "← Back").
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

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [cardSecret, setCardSecret] = useState<string | null>(null);
  const [cardPublishableKey, setCardPublishableKey] = useState<string | null>(null);
  // Tracks a purchase started this session, on top of whatever
  // activePurchaseId came in already active — either way, once set, a
  // real Purchase exists and Get payment link/Enter card now (if
  // pressed again) should talk to that same one rather than trying to
  // start a second.
  const [startedPurchaseId, setStartedPurchaseId] = useState<string | null>(activePurchaseId);

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
    `rounded-md border px-4 py-3 text-left text-sm ${
      active ? "border-2 border-neutral-900" : "border-neutral-300 hover:border-neutral-400"
    }`;

  const buildStartFormData = () => {
    const fd = new FormData();
    fd.set("buyerName", buyerName.trim());
    fd.set("buyerEmail", buyerEmail.trim());
    fd.set("type", option === "instalments" ? "INSTALMENTS" : "FULL");
    fd.set("depositPaid", depositPaid.trim());
    fd.set("currency", currency);
    return fd;
  };

  // Split into two explicit branches (2026-09-10 build fix) rather than
  // a single ternary feeding one `result` variable — createPaymentLink
  // and startArtworkSaleAndGetLink return differently-shaped success
  // objects (the latter also carries a fresh purchaseId), and merging
  // them into one union made a plain `"purchaseId" in result` check
  // fail to narrow cleanly under this project's TS settings (it was
  // typing result.purchaseId as unknown). Each branch below now talks
  // to exactly one action with its own precisely-typed result, which
  // needs no runtime property check at all.
  const handleGetPaymentLink = () => {
    if (!buyerEmail.trim()) {
      setError("Buyer email is required to get a payment link.");
      return;
    }
    setError(null);
    setLinkUrl(null);
    startTransition(async () => {
      if (startedPurchaseId) {
        const result = await createPaymentLink(startedPurchaseId, siteId, artworkId);
        if (result.ok) {
          setLinkUrl(result.url);
        } else {
          setError(result.error);
        }
        return;
      }

      const result = await startArtworkSaleAndGetLink(artworkId, siteId, buildStartFormData());
      if (result.ok) {
        setStartedPurchaseId(result.purchaseId);
        setLinkUrl(result.url);
      } else {
        setError(result.error);
      }
    });
  };

  const handleEnterCardClick = () => {
    if (!buyerEmail.trim()) {
      setError("Buyer email is required to take a card payment.");
      return;
    }
    setError(null);
    setCardSecret(null);
    setCardPublishableKey(null);
    onEnterCard();
    startTransition(async () => {
      if (startedPurchaseId) {
        const result = await createCardEntryIntent(startedPurchaseId, siteId);
        if (result.ok) {
          setCardSecret(result.clientSecret);
          setCardPublishableKey(result.publishableKey);
        } else {
          setError(result.error);
        }
        return;
      }

      const result = await startArtworkSaleAndEnterCard(artworkId, siteId, buildStartFormData());
      if (result.ok) {
        setStartedPurchaseId(result.purchaseId);
        setCardSecret(result.clientSecret);
        setCardPublishableKey(result.publishableKey);
      } else {
        setError(result.error);
      }
    });
  };

  const handleBackToAvailable = () => {
    const idToAbandon = startedPurchaseId;
    setStartedPurchaseId(null);
    setLinkUrl(null);
    setCardSecret(null);
    setCardPublishableKey(null);
    setError(null);
    onBackToAvailable();
    if (idToAbandon) {
      startTransition(async () => {
        await abandonPurchase(idToAbandon, siteId);
      });
    }
  };

  const handleCancelCardSale = () => {
    const idToAbandon = startedPurchaseId;
    if (!idToAbandon) return;
    startTransition(async () => {
      await abandonPurchase(idToAbandon, siteId);
      setStartedPurchaseId(null);
      setCardSecret(null);
      setCardPublishableKey(null);
      onBackToAvailable();
    });
  };

  const handleDeleteCardSale = () => {
    const idToDelete = startedPurchaseId;
    if (!idToDelete) return;
    startTransition(async () => {
      const result = await deleteGallerySale(idToDelete, siteId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStartedPurchaseId(null);
      setCardSecret(null);
      setCardPublishableKey(null);
      onBackToAvailable();
    });
  };

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
    startTransition(async () => {
      const result = await recordPastSale(artworkId, siteId, fd);
      if (!result.ok) {
        setRecordError(result.error);
        return;
      }
      onSaleCompleted();
    });
  };

  return (
    <div
      className={`space-y-4 rounded-lg border border-neutral-200 p-4 transition-all duration-300 ease-out ${
        shown ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
      }`}
    >
      {mode === "record" ? (
        // Simple record-a-sale form (2026-09-10) — replaces the whole
        // Deposit paid/Purchase option/3-button sale card. Calls the
        // same recordPastSale action the gallery-sale backfill already
        // uses, with commissionPercent left unset (always 0% for a
        // direct sale here, per direct instruction).
        <>
          <button
            type="button"
            onClick={onBackFromRecord}
            className="text-sm text-neutral-500 hover:text-neutral-900 hover:underline"
          >
            ← Back
          </button>

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
            disabled={isPending}
            className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {isPending ? "Recording…" : "Record sale"}
          </button>
        </>
      ) : (
        <>
          {mode === "sale" && (
            <>
              <button
                type="button"
                onClick={handleBackToAvailable}
                className="text-sm text-neutral-500 hover:text-neutral-900 hover:underline"
              >
                ← Back to Available
              </button>

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
            </>
          )}

          <div>
            <p className="mb-1 text-sm font-medium text-neutral-700">Purchase option</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onOptionChange("full")}
                className={cardCls(option === "full")}
              >
                <p className="font-medium text-neutral-900">Full payment</p>
                <p className="text-neutral-600">{formatMoney(remaining, currency)}</p>
              </button>
              <button
                type="button"
                onClick={() => onOptionChange("instalments")}
                className={cardCls(option === "instalments")}
              >
                <p className="font-medium text-neutral-900">{instalmentCount} instalments</p>
                <p className="text-neutral-600">
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          {mode === "sale" ? (
            <>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleGetPaymentLink}
                  disabled={isPending}
                  className="flex-1 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                >
                  {isPending ? "Working…" : "Get payment link"}
                </button>
                <button
                  type="button"
                  onClick={handleEnterCardClick}
                  disabled={isPending}
                  className="flex-1 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
                >
                  Enter card now
                </button>
                <button
                  type="button"
                  onClick={onRecordSale}
                  className="flex-1 rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
                >
                  Record sale
                </button>
              </div>

              {linkUrl && (
                <div className="rounded-md bg-neutral-50 p-3">
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
            </>
          ) : (
            // Card entry — telephone sale, no customer personalisation
            // (direct instruction). Renders the real Stripe Elements
            // form once a client secret comes back from
            // startArtworkSaleAndEnterCard/createCardEntryIntent.
            <div className="space-y-4 rounded-lg border border-neutral-200 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-neutral-700">
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
                  <p className="text-xs text-neutral-400">
                    Status below updates within a few seconds of Stripe confirming the charge.
                  </p>
                </>
              ) : (
                <p className="text-sm text-neutral-400">
                  {isPending ? "Preparing card entry…" : "—"}
                </p>
              )}

              <div className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={handleCancelCardSale}
                  disabled={isPending}
                  className="text-red-600 hover:underline disabled:opacity-50"
                >
                  Cancel sale
                </button>
                <span className="text-neutral-300">·</span>
                <button
                  type="button"
                  onClick={handleDeleteCardSale}
                  disabled={isPending}
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
