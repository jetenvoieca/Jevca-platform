"use client";

import { useState, useTransition } from "react";
import { sendCampaignTestMail, type CampaignMailInput } from "@/lib/actions/campaigns";

// The Campaigns page's Audience box (2026-10-08, from Craig's mockup),
// under the selected campaign's mails. For now: Test message — the mail
// being edited, sent to one address (prefilled with the artist's own
// email) in English and French. Choosing mail lists and the send time
// come next.
export default function CampaignAudience({
  siteId,
  artistEmail,
  mail,
}: {
  siteId: string;
  artistEmail: string | null;
  // The mail being edited, as it stands (including unsaved typing).
  mail: CampaignMailInput;
}) {
  const [to, setTo] = useState(artistEmail ?? "");
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  const send = () => {
    setStatus(null);
    startTransition(async () => {
      const result = await sendCampaignTestMail(siteId, mail, to);
      if ("error" in result) {
        setStatus({ text: result.error, isError: true });
        return;
      }
      const skipped =
        result.skipped.length > 0 ? ` ${result.skipped.join(" and ")} not sent — it has no subject.` : "";
      setStatus({ text: `Sent: ${result.sent.join(" and ")}.${skipped}`, isError: false });
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-300 bg-white p-3">
      <h2 className="text-center text-base text-neutral-800">Audience</h2>
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
          className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400"
        />
        <button
          type="button"
          onClick={send}
          disabled={isPending || !to.trim()}
          className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          {isPending ? "Sending…" : "Send test"}
        </button>
      </div>
      <p className="text-xs text-neutral-400">Sends this mail in English and in French, as two emails.</p>
      {status && (
        <p className={`text-xs ${status.isError ? "text-red-600" : "text-green-700"}`}>{status.text}</p>
      )}
    </div>
  );
}
