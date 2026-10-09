"use client";

import { useEffect, useState } from "react";
import type { CampaignMailData, FollowUpSending } from "@/lib/actions/campaigns";
import { formatParis } from "@/lib/parisTime";
import {
  FOLLOW_UP_CONDITIONS,
  FOLLOW_UP_DAY_LIMITS,
  SHARE_LIMITS,
  campaignMailLabel,
  principalShare,
  type FollowUpCondition,
} from "@/lib/campaignMails";

// The selected campaign's mails in the Campaigns page's right column
// (2026-10-08, from Craig's mockup): click one to edit it. The principal
// mail shows the share it gets (whatever the alternatives leave); each
// alternative's share is typed beside it; the follow-up has who it goes
// to and after how many days, then when it goes (once the campaign is
// sent) — fixed once it starts sending (2026-10-09).

const smallInput =
  "w-14 rounded-md border border-neutral-300 px-1.5 py-1 text-right text-sm text-neutral-900";

export default function CampaignMailList({
  mails,
  selectedId,
  onSelect,
  onShare,
  onFollowUp,
}: {
  mails: CampaignMailData[];
  selectedId: string | null;
  onSelect: (mail: CampaignMailData) => void;
  onShare: (mailId: string, percent: number) => void;
  onFollowUp: (mailId: string, followUp: { condition: FollowUpCondition; days: number }) => void;
}) {
  const shares = mails.flatMap((m) => (m.sharePercent !== null ? [m.sharePercent] : []));
  return (
    <div className="flex flex-col gap-1.5">
      {mails.map((m) => (
        <div
          key={m.id}
          className={`flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 ${
            m.id === selectedId ? "border-neutral-900 bg-neutral-100" : "border-neutral-200"
          }`}
        >
          <button
            type="button"
            onClick={() => m.id !== selectedId && onSelect(m)}
            className="min-w-0 flex-1 truncate text-left text-sm text-neutral-800"
          >
            {campaignMailLabel(m.kind, m.position)}
          </button>
          {m.kind === "PRINCIPAL" && shares.length > 0 && (
            <span className="text-sm text-neutral-500">{principalShare(shares)} %</span>
          )}
          {m.kind === "ALTERNATIVE" && m.sharePercent !== null && (
            <span className="flex items-center gap-1 text-sm text-neutral-500">
              <NumberBox
                value={m.sharePercent}
                limits={SHARE_LIMITS}
                label={`Share for ${campaignMailLabel(m.kind, m.position)}`}
                onCommit={(n) => onShare(m.id, n)}
              />
              %
            </span>
          )}
          {m.followUp && (
            <div className="flex w-full items-center gap-1.5 text-sm text-neutral-500">
              <select
                value={m.followUp.condition}
                disabled={!!m.followUpSending?.startedAt}
                onChange={(e) =>
                  onFollowUp(m.id, {
                    ...m.followUp!,
                    condition: e.target.value as FollowUpCondition,
                  })
                }
                aria-label="Who the follow-up goes to"
                className="min-w-0 flex-1 rounded-md border border-neutral-300 px-1.5 py-1 text-sm text-neutral-900 disabled:opacity-60"
              >
                {FOLLOW_UP_CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              after
              <NumberBox
                value={m.followUp.days}
                limits={FOLLOW_UP_DAY_LIMITS}
                label="Days after the campaign"
                disabled={!!m.followUpSending?.startedAt}
                onCommit={(days) => onFollowUp(m.id, { ...m.followUp!, days })}
              />
              days
            </div>
          )}
          {m.followUpSending && <FollowUpStatus sending={m.followUpSending} />}
        </div>
      ))}
    </div>
  );
}

// Where the follow-up's sending stands.
function FollowUpStatus({ sending }: { sending: FollowUpSending }) {
  if (sending.sentAt) return <p className="w-full text-xs text-green-700">Sent {formatParis(new Date(sending.sentAt))}</p>;
  if (sending.startedAt) return <p className="w-full text-xs text-amber-700">Sending…</p>;
  return (
    <>
      {sending.error && <p className="w-full text-xs text-red-600">{sending.error}</p>}
      {sending.dueAt && (
        <p className="w-full text-xs text-neutral-500">Goes {formatParis(new Date(sending.dueAt))}</p>
      )}
    </>
  );
}

// A small whole-number box, applied when it's left (or Enter); anything
// outside its limits or not a number goes back to the current value.
function NumberBox({
  value,
  limits,
  label,
  disabled,
  onCommit,
}: {
  value: number;
  limits: { min: number; max: number };
  label: string;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const commit = () => {
    const n = Math.round(Number(text));
    if (!Number.isFinite(n) || n < limits.min || n > limits.max || n === value) {
      setText(String(value));
      return;
    }
    onCommit(n);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      aria-label={label}
      disabled={disabled}
      className={`${smallInput} disabled:opacity-60`}
    />
  );
}
