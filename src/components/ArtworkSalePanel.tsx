"use client";

import { useEffect, useState } from "react";

const boxCls =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-sm placeholder:text-neutral-400";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

// The "Sold" sale panel (2026-09-10, direct request) — opens right
// under Size/Location (see ArtworkCatalogueFields' afterLocation slot)
// when the Availability toggle further down the form is switched to
// SOLD. Layout/calculations only for now: Get payment link/Enter card
// now/Record sale don't do anything yet — deliberately left unwired
// until the surrounding flow (what each one should actually do) is
// confirmed, per direct instruction. Deposit paid/Date paid/Purchase
// option/Name/Email are all local state only, not yet autosaved.
export default function ArtworkSalePanel({
  offeredPrice,
  currency,
  defaultInstalmentCount,
  onBackToAvailable,
}: {
  offeredPrice: string | null;
  currency: string;
  defaultInstalmentCount: number;
  // 2026-09-10 — everything below this panel (Date, Reference/Offered
  // price, the Available/SOLD toggle itself, Studio notes) is now
  // hidden while the panel is open (see ArtworkCatalogueFields'
  // hideTail), matching the mockup exactly. That removed the only way
  // back to Available, so this small link takes its place — living
  // inside the panel rather than below it, so the "nothing shows below
  // Record sale" rule still holds.
  onBackToAvailable: () => void;
}) {
  const [depositPaid, setDepositPaid] = useState("");
  const [datePaid, setDatePaid] = useState("");
  const [option, setOption] = useState<"full" | "instalments">("full");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // Slide-up entrance (2026-09-10, direct request — "sale panel slides
  // up into view") — starts a touch below/faded and animates to its
  // resting position right after mount, rather than just popping in.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 10);
    return () => clearTimeout(t);
  }, []);

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

      {/* Not wired up yet — layout only, per direct instruction. */}
      <div className="flex gap-3">
        <button
          type="button"
          className="flex-1 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Get payment link
        </button>
        <button
          type="button"
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
    </div>
  );
}
