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
// SOLD. Layout/calculations only for now: Get payment link/Record sale/
// Take payment don't do anything yet — deliberately left unwired until
// the surrounding flow (what each one should actually do) is confirmed,
// per direct instruction. Deposit paid/Date paid/Purchase option/Name/
// Email/card fields are all local state only, not yet autosaved.
//
// Enter card now (2026-09-10 follow-up) switches this panel into
// "card" mode — telephone-sale card entry, no customer personalisation
// needed (direct instruction: "this is only used for telephone sales").
// Deposit paid/Date paid and the three-button row drop out in this mode;
// Card number/Expiry/Security code/Country plus a single Take payment
// button take their place, with Cancel sale/Delete underneath instead of
// the "Back to Available" link. Repositioning the whole panel up to sit
// right under Name/Tier while in card mode is handled one level up, in
// ArtworkDetailPanel (this component doesn't know about Type/Group/
// Medium/Size/Location at all).
export default function ArtworkSalePanel({
  offeredPrice,
  currency,
  defaultInstalmentCount,
  mode,
  onBackToAvailable,
  onEnterCard,
}: {
  offeredPrice: string | null;
  currency: string;
  defaultInstalmentCount: number;
  // "sale" — the normal Deposit paid/Purchase option/Name/Email/3-button
  // view. "card" — the telephone-sale card entry view, entered via
  // Enter card now.
  mode: "sale" | "card";
  // 2026-09-10 — everything below this panel (Date, Reference/Offered
  // price, the Available/SOLD toggle itself, Studio notes) is hidden
  // while the panel is open, so this link (sale mode only) takes the
  // toggle's place as the way back to Available.
  onBackToAvailable: () => void;
  // Switches this panel into card mode (sale mode's "Enter card now"
  // button).
  onEnterCard: () => void;
}) {
  const [depositPaid, setDepositPaid] = useState("");
  const [datePaid, setDatePaid] = useState("");
  const [option, setOption] = useState<"full" | "instalments">("full");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // Slide-up entrance (2026-09-10, direct request — "sale panel slides
  // up into view") — starts a touch below/faded and animates to its
  // resting position right after mount, rather than just popping in.
  // Re-triggers on mode change too, so switching into card mode gets
  // its own small "slides up further" motion (2026-09-10 follow-up),
  // not just the initial open.
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
              onChange={(e) => setDepositPaid(e.target.value)}
              placeholder="Deposit paid"
              className={boxCls}
            />
            <input
              type="date"
              value={datePaid}
              onChange={(e) => setDatePaid(e.target.value)}
              placeholder="Date paid"
              className={boxCls}
            />
          </div>
        </>
      )}

      <div>
        <p className="mb-1 text-sm font-medium text-neutral-700">Purchase option</p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setOption("full")} className={cardCls(option === "full")}>
            <p className="font-medium text-neutral-900">Full payment</p>
            <p className="text-neutral-600">{formatMoney(remaining, currency)}</p>
          </button>
          <button
            type="button"
            onClick={() => setOption("instalments")}
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
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        className={boxCls}
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
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
            className="flex-1 rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Record sale
          </button>
        </div>
      ) : (
        // Card entry — telephone sale, no customer personalisation
        // (direct instruction). Not wired to real Stripe processing yet
        // — layout only, same as the rest of this panel so far.
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
    </div>
  );
}
