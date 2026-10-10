"use client";

import { useState, useTransition } from "react";
import { composePersonal } from "@/lib/actions/gmail";
import type { ComposeRecipient } from "@/lib/actions/adminEmail";
import { capitaliseParagraphs } from "@/lib/text";
import { ActionPanel, ActionButton } from "@/components/ActionPanel";
import PopupWindow from "@/components/PopupWindow";

// Compose in the Inbox's Personal tab (2026-10-10, direct request): a new
// email sent through Craig's Gmail, from its own sending address (shown
// here), so it lands in Gmail's Sent too. To takes one or more addresses
// separated by commas, typed or picked from the artists and contacts
// list.
export default function PersonalComposePopup({
  fromAddress,
  composeRecipients,
  onSent,
  onClose,
}: {
  fromAddress: string | null;
  composeRecipients: ComposeRecipient[];
  onSent: () => void;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const inputCls = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs text-neutral-500";

  const handleClose = () => {
    if (isPending) return;
    if ((to.trim() || subject.trim() || body.trim()) && !confirm("Close without sending what you've typed?")) return;
    onClose();
  };

  const handleSend = () => {
    setError(null);
    startTransition(async () => {
      const res = await composePersonal(to, subject, capitaliseParagraphs(body));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSent();
    });
  };

  return (
    <PopupWindow title="New email" busy={isPending} onClose={handleClose}>
      {fromAddress && <p className="text-xs text-neutral-400">From {fromAddress}</p>}
      <div>
        <label className={labelCls}>To</label>
        <input
          list="personal-compose-recipients"
          type="text"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Type an address, or pick from the list — several separated by commas"
          className={inputCls}
        />
        <datalist id="personal-compose-recipients">
          {composeRecipients.map((r) => (
            <option key={`${r.artistId || "c"}-${r.email}`} value={r.email}>
              {r.label}
            </option>
          ))}
        </datalist>
      </div>
      <div>
        <label className={labelCls}>Subject</label>
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Message</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className={inputCls} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ActionPanel>
        <ActionButton onClick={handleSend} disabled={isPending}>
          {isPending ? "Sending…" : "Send"}
        </ActionButton>
      </ActionPanel>
    </PopupWindow>
  );
}
