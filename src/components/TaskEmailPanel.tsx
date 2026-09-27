"use client";

import { useEffect, useState, useTransition } from "react";
import { getTaskActivity, type TaskActivityItem } from "@/lib/actions/tasks";
import { sendAdminEmail } from "@/lib/actions/adminEmail";
import type { Mailbox } from "@/lib/email";
import { formatDateTime } from "@/lib/formatDate";
import { capitaliseParagraphs } from "@/lib/text";
import { ActionPanel, ActionButton } from "@/components/ActionPanel";

// A task's Activity (2026-09-27, direct request — "moving into managing
// tasks, not just recording them"), shown under the task form once the
// task exists: every email sent from the task and every reply linked back
// to it, newest first, each opening in place to read.
//
// The task form's Send email button opens the compose form here
// (`composing`, owned by AdminInboxPanel alongside the rest of the task
// modal). It starts with the task's own email address, and asks which
// address to send from — Art or Business — each time. Sending goes
// through the same sendAdminEmail as the Inbox's New message, with the
// task's id, so it also appears in that mailbox's Sent list. The task
// itself stays open; completing it is still a separate choice.
//
// Anything typed but not yet sent is reported through onDirtyChange, so
// tapping outside the modal asks before throwing it away.

const MAILBOXES: { mailbox: Mailbox; label: string }[] = [
  { mailbox: "ART", label: "Art" },
  { mailbox: "BUSINESS", label: "Business" },
];

export default function TaskEmailPanel({
  taskId,
  defaultTo,
  mailboxAddresses,
  composing,
  onComposeClose,
  onDirtyChange,
}: {
  taskId: string;
  defaultTo: string;
  mailboxAddresses: Record<Mailbox, string>;
  composing: boolean;
  onComposeClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [activity, setActivity] = useState<TaskActivityItem[] | null>(null);
  const [activityError, setActivityError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTaskActivity(taskId)
      .then((items) => {
        if (!cancelled) setActivity(items);
      })
      .catch(() => {
        if (!cancelled) setActivityError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, refreshKey]);

  const handleSent = () => {
    onComposeClose();
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="mx-auto mt-6 max-w-xl space-y-3 border-t border-neutral-200 pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Activity</p>

      {composing && (
        <TaskEmailCompose
          taskId={taskId}
          defaultTo={defaultTo}
          mailboxAddresses={mailboxAddresses}
          onSent={handleSent}
          onCancel={onComposeClose}
          onDirtyChange={onDirtyChange}
        />
      )}

      {activityError ? (
        <p className="text-sm text-red-600">The activity couldn&apos;t be loaded. Please try again.</p>
      ) : !activity ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : activity.length === 0 ? (
        <p className="text-sm text-neutral-400">No emails yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
          {activity.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setOpenItemId(openItemId === item.id ? null : item.id)}
                className="block w-full px-3 py-2 text-left hover:bg-neutral-50"
              >
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <span className="truncate text-sm text-neutral-700">
                    <span className="mr-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                      {item.direction === "OUT" ? "Sent" : "Reply"}
                    </span>
                    {item.direction === "OUT" ? item.toAddress : item.fromName || item.fromAddress}
                  </span>
                  <span className="shrink-0 text-[10px] text-neutral-400">{formatDateTime(item.at)}</span>
                </div>
                <p className="truncate text-xs text-neutral-500">{item.subject || "(no subject)"}</p>
              </button>
              {openItemId === item.id && (
                <p className="whitespace-pre-wrap px-3 pb-3 text-sm text-neutral-700 [overflow-wrap:anywhere]">
                  {item.body || "(empty)"}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The compose form — only mounted while open, so each time it opens it
// starts afresh from the task's email address at that moment.
function TaskEmailCompose({
  taskId,
  defaultTo,
  mailboxAddresses,
  onSent,
  onCancel,
  onDirtyChange,
}: {
  taskId: string;
  defaultTo: string;
  mailboxAddresses: Record<Mailbox, string>;
  onSent: () => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const inputCls = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs text-neutral-500";
  const pillCls = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition ${
      active ? "bg-neutral-200 text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
    }`;

  const dirty = subject.trim() !== "" || body.trim() !== "";
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  // Closing the form (sent or cancelled) leaves nothing unsaved.
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const handleSend = () => {
    if (!mailbox) {
      setError("Choose which address to send from — Art or Business.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("to", to.trim());
    fd.set("subject", subject);
    fd.set("body", capitaliseParagraphs(body));
    fd.set("mailbox", mailbox);
    fd.set("taskId", taskId);
    startTransition(async () => {
      const res = await sendAdminEmail(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSent();
    });
  };

  return (
    <div className="space-y-3 rounded-md border border-neutral-200 p-3">
      <div>
        <label className={labelCls}>Send from</label>
        <div className="inline-flex w-fit rounded-full border border-neutral-300 bg-white p-1">
          {MAILBOXES.map((m) => (
            <button
              key={m.mailbox}
              type="button"
              onClick={() => setMailbox(m.mailbox)}
              className={pillCls(mailbox === m.mailbox)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mailbox && <p className="mt-1 text-xs text-neutral-400">{mailboxAddresses[mailbox]}</p>}
      </div>
      <div>
        <label className={labelCls}>To</label>
        <input
          list="task-email-recipients"
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Subject</label>
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Message</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className={inputCls} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ActionPanel>
        <ActionButton onClick={handleSend} disabled={isPending}>
          {isPending ? "Sending…" : "Send"}
        </ActionButton>
        <ActionButton onClick={onCancel} disabled={isPending}>
          Cancel
        </ActionButton>
      </ActionPanel>
    </div>
  );
}
