"use client";

import { useState, useTransition } from "react";
import { setHouseClient } from "@/lib/actions/houseClients";

// Administration → Clients: whether this client is one of ours — a house
// client (2026-11-14), whose sites show Curator curations mixing works
// from any artist.
export default function HouseClientCard({ artistId, initial }: { artistId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggle = (next: boolean) => {
    setOn(next);
    setError(null);
    startTransition(async () => {
      try {
        await setHouseClient(artistId, next);
      } catch {
        setOn(!next);
        setError("That wasn't saved — please try again.");
      }
    });
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">House client</p>
      <label className="flex items-start gap-2 text-sm text-neutral-800">
        <input
          type="checkbox"
          checked={on}
          disabled={isPending}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5"
        />
        <span>One of ours — its sites show Curator curations with works from any artist.</span>
      </label>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
