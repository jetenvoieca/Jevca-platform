"use client";

import { useState } from "react";
import { runSubscriptionPaymentsBackfill } from "@/lib/actions/accounts";

// One button, permanently available rather than a one-off script — a real
// resync tool, not just a fix for this particular incident (2026-08-18:
// the platform webhook silently failed for a while, and by the time it
// was fixed Stripe had already marked those deliveries "succeeded", so
// there was no way to replay them from Stripe's own dashboard). Safe to
// press more than once — it only ever fills in what's actually missing.
export default function AccountsBackfillButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ checked: number; created: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const outcome = await runSubscriptionPaymentsBackfill();
      setResult(outcome);
    } catch {
      setError("Couldn't reach Stripe. Try again in a moment.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={handleClick}
        disabled={running}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
      >
        {running ? "Checking Stripe…" : "Resync from Stripe"}
      </button>
      {result && (
        <p className="mt-1.5 text-xs text-neutral-500">
          Checked {result.checked} paid invoice{result.checked === 1 ? "" : "s"} on Stripe —{" "}
          {result.created === 0
            ? "nothing missing."
            : `added ${result.created} payment${result.created === 1 ? "" : "s"} that hadn't made it in yet.`}
        </p>
      )}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
