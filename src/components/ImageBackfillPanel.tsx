"use client";

import { useState } from "react";
import { backfillOneImage, refreshMediaAfterBackfill } from "@/lib/actions/imageBackfill";

export default function ImageBackfillPanel({
  artistId,
  siteId,
  initialCount,
}: {
  artistId: string;
  siteId: string;
  initialCount: number;
}) {
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(initialCount);
  const [failed, setFailed] = useState(0);
  const [finished, setFinished] = useState(false);

  if (initialCount === 0 && !finished) return null;

  const handleRun = async () => {
    setRunning(true);
    const excludeIds: string[] = [];
    let remainingCount = initialCount;

    // Bounded by the count at the start, not "loop until the server says
    // done" — guarantees this finishes even if every single image were
    // to fail, rather than risking an infinite loop (see decisions log,
    // 2026-08-13).
    for (let i = 0; i < initialCount; i++) {
      const result = await backfillOneImage(artistId, excludeIds);
      if (result.done) {
        remainingCount = 0;
        break;
      }
      excludeIds.push(result.imageId);
      if (!result.ok) setFailed((f) => f + 1);
      remainingCount -= 1;
      setRemaining(remainingCount);
      // Same small pause used by the CSV import loop — keeps this from
      // hammering storage and the database back-to-back for ~100 images.
      await new Promise((r) => setTimeout(r, 300));
    }

    await refreshMediaAfterBackfill(siteId);
    setRunning(false);
    setFinished(true);
  };

  return (
    <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
      {finished ? (
        <p className="text-neutral-700">
          Backfill complete.{" "}
          {failed > 0
            ? `${failed} image${failed === 1 ? "" : "s"} couldn't be processed and will keep using their original file — safe to leave as is.`
            : "All images now have fast-loading versions."}
        </p>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="text-neutral-700">
            {initialCount} image{initialCount === 1 ? "" : "s"} uploaded before the new fast-loading
            system{initialCount === 1 ? " hasn't" : " haven't"} been converted yet. This is a one-time
            step — it won't affect anything visitors currently see.
          </p>
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {running ? `Processing… ${remaining} left` : "Run one-time backfill"}
          </button>
        </div>
      )}
    </div>
  );
}
