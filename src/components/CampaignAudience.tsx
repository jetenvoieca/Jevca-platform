"use client";

import { useState, useTransition } from "react";
import {
  cancelCampaignSend,
  getCampaignSendCounts,
  scheduleCampaignSend,
  sendCampaignTestMail,
  setCampaignLists,
  type CampaignMailInput,
  type CampaignSummary,
} from "@/lib/actions/campaigns";
import type { MailListSummary } from "@/lib/actions/subscribers";
import type { SendCounts } from "@/lib/campaignSending";
import { dateToParis, formatParis } from "@/lib/parisTime";
import ConfirmDialog from "@/components/ConfirmDialog";

// The Campaigns page's Audience box (2026-10-08, from Craig's mockup),
// under the selected campaign's mails: Test message (the mail being
// edited, to one address, in English and French), the mail lists it
// goes to, and Send now / Send at a Paris date and time (in 5-minute
// steps). Sending asks to confirm, with how many it goes to. Once set to
// send it shows when (with Cancel), then how sending is going, then
// what was sent.

type Pending = { at: { date: string; time: string } | null; counts: SendCounts };

const inputClass =
  "min-w-0 rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 disabled:opacity-50";

const TIMES = Array.from({ length: 24 * 12 }, (_, i) => {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(Math.floor(i / 12))}:${two((i % 12) * 5)}`;
});

// The next 5-minute step at least 10 minutes from now, as a starting
// suggestion for Send at.
function suggestedTime(): { date: string; time: string } {
  const at = new Date(Date.now() + 10 * 60_000);
  at.setMinutes(Math.ceil(at.getMinutes() / 5) * 5, 0, 0);
  return dateToParis(at);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export default function CampaignAudience({
  siteId,
  artistEmail,
  campaign,
  lists,
  mail,
  beforeSend,
  onCampaign,
}: {
  siteId: string;
  artistEmail: string | null;
  campaign: CampaignSummary;
  lists: MailListSummary[];
  // The mail being edited, as it stands (including unsaved typing).
  mail: CampaignMailInput;
  // Saves anything still being typed, so what's sent is what's on screen.
  beforeSend: () => Promise<unknown>;
  onCampaign: (campaign: CampaignSummary) => void;
}) {
  const [to, setTo] = useState(artistEmail ?? "");
  const [testStatus, setTestStatus] = useState<{ text: string; isError: boolean } | null>(null);
  const [sendAt, setSendAt] = useState(suggestedTime);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const editable = campaign.status === "DRAFT" || campaign.status === "SCHEDULED";

  const sendTest = () => {
    setTestStatus(null);
    startTransition(async () => {
      const result = await sendCampaignTestMail(siteId, mail, to);
      if ("error" in result) {
        setTestStatus({ text: result.error, isError: true });
        return;
      }
      const skipped =
        result.skipped.length > 0 ? ` ${result.skipped.join(" and ")} not sent — it has no subject.` : "";
      setTestStatus({ text: `Sent: ${result.sent.join(" and ")}.${skipped}`, isError: false });
    });
  };

  const toggleList = (listId: string) => {
    const listIds = campaign.listIds.includes(listId)
      ? campaign.listIds.filter((id) => id !== listId)
      : [...campaign.listIds, listId];
    const before = campaign;
    setError(null);
    onCampaign({ ...campaign, listIds });
    startTransition(async () => {
      const result = await setCampaignLists(campaign.id, siteId, listIds);
      if ("error" in result) {
        onCampaign(before);
        setError(result.error);
      }
    });
  };

  // Works out who it would go to, then asks to confirm.
  const askToSend = (at: Pending["at"]) => {
    setError(null);
    startTransition(async () => {
      await beforeSend();
      const result = await getCampaignSendCounts(campaign.id, siteId);
      if ("error" in result) setError(result.error);
      else setPending({ at, counts: result.counts });
    });
  };

  const confirmSend = () => {
    if (!pending) return;
    const { at } = pending;
    setPending(null);
    startTransition(async () => {
      const result = await scheduleCampaignSend(campaign.id, siteId, at);
      if ("error" in result) setError(result.error);
      else onCampaign(result.campaign);
    });
  };

  const cancelSend = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelCampaignSend(campaign.id, siteId);
      if ("error" in result) setError(result.error);
      else onCampaign(result.campaign);
    });
  };

  const confirmMessage = (p: Pending) => {
    const { counts } = p;
    const parts = [`${counts.english} English`, `${counts.french} French`].join(", ");
    const skipped =
      counts.frenchSkipped > 0
        ? ` ${plural(counts.frenchSkipped, "French subscriber")} won't get it: their mail has no French subject.`
        : "";
    const when = p.at ? ` on ${p.at.date} at ${p.at.time} (Paris time)` : " now";
    return `Send "${campaign.name}"${when} to ${plural(counts.total, "subscriber")} — ${parts}?${skipped}`;
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-300 bg-white p-3">
      <h2 className="text-center text-base text-neutral-800">Audience</h2>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-neutral-500" htmlFor="test-message-to">
          Test message to
        </label>
        <div className="flex gap-2">
          <input
            id="test-message-to"
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="name@example.com"
            className={`${inputClass} flex-1`}
          />
          <button
            type="button"
            onClick={sendTest}
            disabled={isPending || !to.trim()}
            className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50 disabled:opacity-40"
          >
            Send test
          </button>
        </div>
        <p className="text-xs text-neutral-400">This mail in English and in French, as two emails.</p>
        {testStatus && (
          <p className={`text-xs ${testStatus.isError ? "text-red-600" : "text-green-700"}`}>{testStatus.text}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-neutral-200 pt-3">
        <p className="text-xs text-neutral-500">Mail lists</p>
        {lists.length === 0 ? (
          <p className="text-xs text-neutral-400">No mail lists yet — make them under Subscribers.</p>
        ) : (
          lists.map((list) => (
            <label key={list.id} className="flex items-center gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                checked={campaign.listIds.includes(list.id)}
                onChange={() => toggleList(list.id)}
                disabled={!editable || isPending}
              />
              {list.name}
            </label>
          ))
        )}
        <p className="text-xs text-neutral-400">Anyone on more than one list gets one copy.</p>
      </div>

      <div className="flex flex-col gap-2 border-t border-neutral-200 pt-3">
        {campaign.status === "DRAFT" && (
          <>
            {campaign.sendError && (
              <p className="text-xs text-red-600">Couldn&apos;t send at the time set: {campaign.sendError}</p>
            )}
            <button
              type="button"
              onClick={() => askToSend(null)}
              disabled={isPending}
              className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              Send now
            </button>
            <div className="flex items-center gap-1.5 text-sm text-neutral-600">
              <span>Send at</span>
              <select
                value={sendAt.time}
                onChange={(e) => setSendAt({ ...sendAt, time: e.target.value })}
                aria-label="Send time (Paris)"
                className={inputClass}
              >
                {TIMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={sendAt.date}
                onChange={(e) => setSendAt({ ...sendAt, date: e.target.value })}
                aria-label="Send date"
                className={`${inputClass} flex-1`}
              />
            </div>
            <button
              type="button"
              onClick={() => askToSend(sendAt)}
              disabled={isPending || !sendAt.date}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50 disabled:opacity-40"
            >
              Schedule
            </button>
            <p className="text-xs text-neutral-400">Paris time. Sending starts within 5 minutes of it.</p>
          </>
        )}

        {campaign.status === "SCHEDULED" && campaign.scheduledAt && (
          <>
            <p className="text-sm text-neutral-800">
              {new Date(campaign.scheduledAt).getTime() <= Date.now()
                ? "Starting to send…"
                : `Scheduled for ${formatParis(new Date(campaign.scheduledAt))} (Paris time).`}
            </p>
            <p className="text-xs text-neutral-400">It can still be changed until then.</p>
            <button
              type="button"
              onClick={cancelSend}
              disabled={isPending}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50 disabled:opacity-40"
            >
              Cancel sending
            </button>
          </>
        )}

        {(campaign.status === "SENDING" || campaign.status === "SENT") && campaign.progress && (
          <ProgressLine campaign={campaign} />
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <ConfirmDialog
        open={!!pending}
        title={pending?.at ? "Schedule this campaign?" : "Send this campaign now?"}
        message={pending ? confirmMessage(pending) : ""}
        confirmLabel={pending?.at ? "Schedule" : "Send now"}
        onConfirm={confirmSend}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

function ProgressLine({ campaign }: { campaign: CampaignSummary }) {
  const p = campaign.progress!;
  const extra = [
    p.skipped > 0 ? `${p.skipped} skipped` : null,
    p.failed > 0 ? `${p.failed} failed` : null,
  ].filter(Boolean);
  const tail = extra.length > 0 ? ` (${extra.join(", ")})` : "";
  if (campaign.status === "SENDING") {
    return (
      <p className="text-sm text-neutral-800">
        Sending… {p.sent} of {p.sent + p.waiting} sent{tail}.
      </p>
    );
  }
  return (
    <p className="text-sm text-neutral-800">
      Sent{campaign.sentAt ? ` ${formatParis(new Date(campaign.sentAt))}` : ""} — {plural(p.sent, "mail")}
      {tail}.
    </p>
  );
}
