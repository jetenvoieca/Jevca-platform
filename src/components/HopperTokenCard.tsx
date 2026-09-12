"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { regenerateHopperToken } from "@/lib/actions";

// The Hopper token box — split out of the old SiteSettingsPanel
// (2026-09-12), same reasoning as the other cards. Fully self-contained
// (its own action, no shared-field resubmission risk), so this is the
// simplest of the four.
export default function HopperTokenCard({
  artistId,
  hopperToken,
  className = "",
}: {
  artistId: string;
  hopperToken: string;
  className?: string;
}) {
  const [tokenCopied, setTokenCopied] = useState(false);
  const [regeneratingToken, setRegeneratingToken] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleCopyToken = async (token: string) => {
    await navigator.clipboard.writeText(token);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 1500);
  };

  const handleRegenerateToken = () => {
    if (
      !confirm(
        "Regenerate this artist's Hopper token? Any copy of their iPhone Shortcut still using the old token will stop working until it's updated with the new one."
      )
    ) {
      return;
    }
    setRegeneratingToken(true);
    startTransition(async () => {
      await regenerateHopperToken(artistId);
      router.refresh();
      setRegeneratingToken(false);
    });
  };

  return (
    <div className={`rounded-md border border-neutral-200 p-3 ${className}`}>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Hopper Token
      </p>
      <p className="mb-2 text-xs text-neutral-400">
        Paste this into this artist&apos;s copy of the iPhone Shortcut, so photos and video they
        share land in their Hopper.
      </p>
      <div className="flex items-center gap-2">
        <input
          key={`owner-hopper-token-${artistId}`}
          type="text"
          readOnly
          value={hopperToken}
          onFocus={(e) => e.target.select()}
          className="w-full rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 font-mono text-xs text-neutral-700"
        />
        <button
          type="button"
          onClick={() => handleCopyToken(hopperToken)}
          className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
        >
          {tokenCopied ? "Copied" : "Copy"}
        </button>
      </div>
      <button
        type="button"
        disabled={regeneratingToken || isPending}
        onClick={handleRegenerateToken}
        className="mt-2 text-xs text-red-600 hover:underline disabled:opacity-50"
      >
        {regeneratingToken ? "Regenerating…" : "Regenerate token"}
      </button>
    </div>
  );
}
