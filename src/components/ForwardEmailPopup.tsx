"use client";

import { useState, useTransition } from "react";
import { forwardEmail, type ComposeRecipient, type ForwardSource } from "@/lib/actions/adminEmail";
import { capitaliseParagraphs } from "@/lib/text";
import { ActionPanel, ActionButton } from "@/components/ActionPanel";
import PopupWindow from "@/components/PopupWindow";

// The Forward window (2026-09-28, direct request), opened from a received
// or sent email in the Inbox: who to send it to — typed, or picked from
// the same artists and contacts list as New message — and an optional
// note to go above it. The email itself, its formatting and (for a
// received email) its stored attachments are added by forwardEmail, which
// also decides the from-address: the shared address of the email's own
// mailbox, shown here so there are no surprises.
export default function ForwardEmailPopup({
  source,
  subject,
  attachmentCount,
  fromAddress,
  composeRecipients,
  onSent,
  onClose,
}: {
  source: ForwardSource;
  subject: string | null;
  attachmentCount: number;
  fromAddress: string;
  composeRecipients: ComposeRecipient[];
  onSent: () => void;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const inputCls = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs text-neutral-500";

  const handleClose = () => {
    if (isPending) return;
    if ((to.trim() || note.trim()) && !confirm("Close without forwarding?")) return;
    onClose();
  };

  const handleSend = () => {
    setError(null);
    const fd = new FormData();
    fd.set("to", to.trim());
    fd.set("note", capitaliseParagraphs(note));
    startTransition(async () => {
      const res = await forwardEmail(source, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSent();
    });
  };

  return (
    <PopupWindow title="Forward" busy={isPending} onClose={handleClose}>
      <p className="text-xs text-neutral-400">
        From {fromAddress} — &ldquo;{subject || "(no subject)"}&rdquo;
        {attachmentCount > 0 && `, with ${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`}
      </p>
      <div>
        <label className={labelCls}>To</label>
        <input
          list="forward-recipients"
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Type an address, or pick from the list"
          className={inputCls}
        />
        <datalist id="forward-recipients">
          {composeRecipients.map((r) => (
            <option key={`${r.artistId || "c"}-${r.email}`} value={r.email}>
              {r.label}
            </option>
          ))}
        </datalist>
      </div>
      <div>
        <label className={labelCls}>Note</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="Optional — goes above the forwarded email"
          className={inputCls}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ActionPanel>
        <ActionButton onClick={handleSend} disabled={isPending}>
          {isPending ? "Forwarding…" : "Forward"}
        </ActionButton>
      </ActionPanel>
    </PopupWindow>
  );
}
