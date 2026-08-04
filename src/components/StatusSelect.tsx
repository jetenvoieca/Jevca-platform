"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSiteStatus } from "@/lib/actions";

const STATUS_OPTIONS = ["DRAFT", "LIVE", "PAUSED", "ISYT"] as const;
const STATUS_LABELS: Record<(typeof STATUS_OPTIONS)[number], string> = {
  DRAFT: "Draft",
  LIVE: "Live",
  PAUSED: "Paused",
  // Third-party/legacy site being tracked here ahead of being rebuilt in
  // Studio — not one of the "real" build states.
  ISYT: "ISYT",
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
        const newStatus = e.target.value as "DRAFT" | "LIVE" | "PAUSED" | "ISYT";
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
