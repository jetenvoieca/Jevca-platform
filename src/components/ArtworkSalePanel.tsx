"use client";

import { useEffect, useState } from "react";

const boxCls =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-sm placeholder:text-neutral-400";
const fieldCls = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const labelCls = "mb-1 block text-sm font-medium text-neutral-700";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

// The "Sold" sale panel (2026-09-10, direct request) — opens right
// under Size/Location (see ArtworkCatalogueFields' afterLocation slot)
// when the Availability toggle further down the form is switched to
// SOLD. Layout/calculations only for now: Get payment link/Take
// payment/the record-sale form below don't do anything yet —
// deliberately left unwired until the surrounding flow (what each one
// should actually do) is confirmed, per direct instruction.
//
// Enter card now switches this panel into "card" mode — telephone-sale
// card entry, no customer personalisation needed (direct instruction:
// "this is only used for telephone sales"). Repositioning the whole
// panel up to sit right under Name/Tier while in card mode is handled
// one level up, in ArtworkDetailPanel (this component doesn't know
// about Type/Group/Medium/Size/Location at all).
//
// Record sale (2026-09-10 follow-up) swaps this same panel — still in
// its normal afterLocation position, no repositioning like card mode —
// for a simple Price/Currency/Date paid/Source/Name/Email/Address form,
// replacing the Deposit paid/Purchase option/3-button sale card
// entirely. Name/Email are the same lifted fields as sale mode (a
// buyer's details don't change just because the entry method did);
// Price/Currency/Date paid/Source/Address are new, local to this mode.
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
  onBackToAvailable,
  onEnterCard,
  onRecordSale,
  onBackFromRecord,
}: {
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
  // 2026-09-10 — everything below this panel (Date, Reference/Offered
  // price, the Available/SOLD toggle itself, Studio notes) is hidden
  // while the panel is open, so this link (sale mode only) takes the
  // toggle's place as the way back to Available.
  onBackToAvailable: () => void;
  // Switches this panel into card mode (sale mode's "Enter card now"
  // button).
  onEnterCard: () => void;
  // Switches this panel into record mode (sale mode's "Record sale"
  // button).
  onRecordSale: () => void;
  // Back out of record mode, to sale mode (record mode's own "← Back").
  onBackFromRecord: () => void;
}) {
  const [recordPrice, setRecordPrice] = useState("");
  const [recordCurrency, setRecordCurrency] = useState(currency);
  const [recordDatePaid, setRecordDatePaid] = useState("");
  const [recordSource, setRecordSource] = useState("");
  const [recordAddress, setRecordAddress] = useState("");

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

  return (
    <div
      className={`space-y-4 rounded-lg border border-neutral-200 p-4 transition-all duration-300 ease-out ${
        shown ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
      }`}
    >
      {mode === "record" ? (
        // Simple record-a-sale form (2026-09-10) — replaces the whole
        // Deposit paid/Purchase option/3-button sale card. Not wired to
        // a save action yet — layout only, same staged approach as the
        // rest of this panel.
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

          <button
            type="button"
            className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Record sale
          </button>
        </>
      ) : (
        <>
          {mode === "sale" && (
            <>
              <button
                type="button"
                onClick={onBackToAvailable}
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

          {mode === "sale" ? (
            // Not wired up yet — layout only, per direct instruction.
            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
              >
                Get payment link
              </button>
              <button
                type="button"
                onClick={onEnterCard}
                className="flex-1 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
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
          ) : (
            // Card entry — telephone sale, no customer personalisation
            // (direct instruction). Not wired to real Stripe processing
            // yet — layout only, same as the rest of this panel so far.
            <div className="space-y-4 rounded-lg border border-neutral-200 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-neutral-700">
                  <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
                  <rect x="2" y="9" width="20" height="3" fill="currentColor" />
                </svg>
                Card
              </div>
              <p className="text-sm text-blue-600">🔒 Secure, fast checkout with Link ⌄</p>
              <div>
                <label className={labelCls}>Card number</label>
                <input type="text" placeholder="1234 1234 1234 1234" className={fieldCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Expiry date</label>
                  <input type="text" placeholder="MM / YY" className={fieldCls} />
                </div>
                <div>
                  <label className={labelCls}>Security code</label>
                  <input type="text" placeholder="CVC" className={fieldCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Country/Territory</label>
                <select className={fieldCls} defaultValue="France">
                  <option>France</option>
                  <option>United Kingdom</option>
                  <option>United States</option>
                </select>
              </div>
              <button
                type="button"
                className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
              >
                Take payment
              </button>
              <p className="text-xs text-neutral-400">
                Status below updates within a few seconds of Stripe confirming the charge.
              </p>
              <div className="flex items-center gap-2 text-sm">
                <button type="button" className="text-red-600 hover:underline">
                  Cancel sale
                </button>
                <span className="text-neutral-300">·</span>
                <button type="button" className="text-red-600 hover:underline">
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
