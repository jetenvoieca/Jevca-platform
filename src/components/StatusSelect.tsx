"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSiteStatus } from "@/lib/actions";

// Archived merged in here 2026-08-19, direct request — replaces a
// separate Archive/Restore button that did the exact same kind of
// update (just this same status field) through a second mechanism.
// Confirms only when switching *into* Archived specifically — that's
// the one transition here with a real, if reversible, consequence (the
// site disappears from the main Sites list by default); every other
// status change is freely reversible with no such effect, so it doesn't
// need one.
const STATUS_OPTIONS = ["DRAFT", "LIVE", "PAUSED", "ISYT", "ARCHIVED"] as const;
const STATUS_LABELS: Record<(typeof STATUS_OPTIONS)[number], string> = {
  DRAFT: "Draft",
  LIVE: "Live",
  PAUSED: "Paused",
  // Third-party/legacy site being tracked here ahead of being rebuilt in
  // Studio — not one of the "real" build states.
  ISYT: "ISYT",
  ARCHIVED: "Archived",
};

export default function StatusSelect({
  siteId,
  status,
}: {
  siteId: string;
  status: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED" | "ISYT";
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <select
      defaultValue={status}
      disabled={isPending}
      onChange={(e) => {
        const newStatus = e.target.value as (typeof STATUS_OPTIONS)[number];
        if (
          newStatus === "ARCHIVED" &&
          !confirm(
            "Archive this site? It will be hidden from the main list by default, but can be restored later by changing this back."
          )
        ) {
          e.target.value = status; // Revert the select — the change didn't happen.
          return;
        }
        startTransition(async () => {
          await updateSiteStatus(siteId, newStatus);
          router.refresh();
        });
      }}
      className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm disabled:opacity-50"
    >
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt} value={opt}>
          {STATUS_LABELS[opt]}
        </option>
      ))}
    </select>
  );
}
