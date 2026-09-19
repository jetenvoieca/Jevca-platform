"use client";

import type { AlertItem } from "@/lib/alerts";
import { ALERT_TYPE_LABELS } from "@/lib/alertLabels";
import { formatDateTime } from "@/lib/formatDate";
import { ActionPanel, ActionButton } from "@/components/ActionPanel";

// The centre panel for any alert that doesn't get the full client panel
// (2026-09-19, CRM Phase 3): the alert's message, plus whatever actions
// it has — a link to where it can be dealt with, and Dismiss for the
// stored alerts that can be dismissed.
export default function AlertDetail({
  item,
  busy,
  onLink,
  onDismiss,
}: {
  item: AlertItem;
  busy: boolean;
  onLink: (item: AlertItem) => void;
  onDismiss: (item: AlertItem) => void;
}) {
  const critical = item.severity === "CRITICAL";
  // Alerts with no natural date (e.g. "no payment method") carry the
  // epoch as a placeholder — not worth showing.
  const hasDate = new Date(item.createdAt).getTime() > 0;

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
          critical ? "bg-red-200 text-red-800" : "bg-amber-200 text-amber-800"
        }`}
      >
        {ALERT_TYPE_LABELS[item.type] || item.type}
      </span>
      <p className="text-sm text-neutral-800">{item.message}</p>
      {hasDate && <p className="text-xs text-neutral-400">{formatDateTime(item.createdAt)}</p>}

      {(item.linkHref || item.dismissable) && (
        <ActionPanel>
          {item.linkHref && (
            <ActionButton onClick={() => onLink(item)} disabled={busy}>
              {item.linkLabel}
            </ActionButton>
          )}
          {item.dismissable && (
            <ActionButton onClick={() => onDismiss(item)} disabled={busy}>
              Dismiss
            </ActionButton>
          )}
        </ActionPanel>
      )}
    </div>
  );
}
