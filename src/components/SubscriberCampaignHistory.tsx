"use client";

import { useEffect, useState } from "react";
import { getSubscriberCampaigns, type SubscriberCampaignRow } from "@/lib/actions/subscribers";
import { formatDate } from "@/lib/formatDate";

// A subscriber's campaigns (2026-10-09, Marketing step 4a), in their
// details panel: each campaign mail they were sent, which version, and
// whether it was delivered, opened and clicked (with the dates), or
// bounced, marked as spam, skipped or failed.
export default function SubscriberCampaignHistory({
  subscriberId,
  artistId,
}: {
  subscriberId: string;
  artistId: string;
}) {
  const [rows, setRows] = useState<SubscriberCampaignRow[] | null>(null);

  useEffect(() => {
    let current = true;
    setRows(null);
    getSubscriberCampaigns(subscriberId, artistId).then((result) => {
      if (current) setRows(result);
    });
    return () => {
      current = false;
    };
  }, [subscriberId, artistId]);

  const sent = rows?.filter((r) => r.status === "SENT") ?? [];
  const opened = sent.filter((r) => r.openedAt).length;
  const clicked = sent.filter((r) => r.clickedAt).length;

  return (
    <div className="border-t border-neutral-100 pt-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium text-neutral-700">Campaigns</h3>
        {sent.length > 0 && (
          <p className="text-xs text-neutral-400">
            {sent.length} sent · {opened} opened · {clicked} clicked
          </p>
        )}
      </div>
      {rows === null ? (
        <p className="text-xs text-neutral-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-neutral-400">No campaigns sent yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-md border border-neutral-200 px-2 py-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm text-neutral-900">{r.campaignName}</span>
                {r.sentAt && <span className="shrink-0 text-xs text-neutral-400">{formatDate(r.sentAt)}</span>}
              </div>
              <p className="text-xs text-neutral-500">
                {r.mailLabel} · {r.language}
              </p>
              <Outcome row={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Outcome({ row }: { row: SubscriberCampaignRow }) {
  if (row.status === "PENDING") return <p className="text-xs text-neutral-400">Waiting to send</p>;
  if (row.status === "SKIPPED") return <p className="text-xs text-neutral-400">Not sent: {row.error ?? "skipped"}</p>;
  if (row.status === "FAILED") return <p className="text-xs text-red-600">Failed: {row.error ?? "unknown reason"}</p>;

  const steps: { label: string; at: string | null }[] = [
    { label: "Delivered", at: row.deliveredAt },
    { label: "Opened", at: row.openedAt },
    { label: "Clicked", at: row.clickedAt },
  ];
  return (
    <div className="mt-1 space-y-0.5">
      <div className="flex flex-wrap gap-1">
        {steps.map((s) => (
          <span
            key={s.label}
            className={`rounded px-1.5 py-0.5 text-[11px] ${
              s.at ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-400"
            }`}
          >
            {s.label}
            {s.at ? ` ${formatDate(s.at)}` : ""}
          </span>
        ))}
      </div>
      {row.bouncedAt && (
        <p className="text-xs text-red-600">
          {row.hardBounce ? "Bounced" : "Temporary bounce"} {formatDate(row.bouncedAt)}
          {row.error ? `: ${row.error}` : ""}
        </p>
      )}
      {row.complainedAt && <p className="text-xs text-red-600">Marked as spam {formatDate(row.complainedAt)}</p>}
    </div>
  );
}
