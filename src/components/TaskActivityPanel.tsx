"use client";

import { useEffect, useState, useTransition } from "react";
import { getTaskActivity, saveTaskNote, deleteTaskNote, type TaskActivityItem } from "@/lib/actions/tasks";
import { sendAdminEmail, type ComposeRecipient } from "@/lib/actions/adminEmail";
import type { Mailbox } from "@/lib/email";
import { formatDate, formatDateTime } from "@/lib/formatDate";
import { capitaliseParagraphs } from "@/lib/text";
import { ActionPanel, ActionButton } from "@/components/ActionPanel";
import SwipeRow from "@/components/SwipeRow";
import PopupWindow from "@/components/PopupWindow";
import { EditIcon, TrashIcon } from "@/components/ActionIcons";

// A task's Activity (2026-09-27, direct request — "moving into managing
// tasks, not just recording them"), shown inside the task form, above its
// action buttons, once the
// task exists: every email sent from the task, every reply linked back to
// it, and notes of what was done (2026-09-28), newest first, each opening
// in place to read. A note can be edited or deleted with a swipe (touch)
// or on hover (mouse) — see SwipeRow; emails can't be changed here.
//
// The task form's Email and Activity buttons open their own windows on top
// of the task (`popup`, owned by AdminInboxPanel alongside the rest of the
// task modal):
//   - Email (2026-09-28, moved out of line — it made the task too long):
//     starts with the task's email address — the last one emailed from
//     it, or the sender of the email it was made from — typed or picked
//     from the same artists and contacts list as New message (the address
//     used to be on the task form; moved here 2026-10-10), and asks which
//     address to
//     send from — Art or Business — each time. It goes through the same
//     sendAdminEmail as the Inbox's New message, with the task's id, so it
//     also appears in that mailbox's Sent list.
//   - Activity: a note with a date (today by default) and what was done.
// The task itself stays open either way; completing it is a separate
// choice. Closing either window asks before throwing away anything typed.

export type TaskPopup = "email" | "note";

const MAILBOXES: { mailbox: Mailbox; label: string }[] = [
  { mailbox: "ART", label: "Art" },
  { mailbox: "BUSINESS", label: "Business" },
];

const TAG_LABELS: Record<TaskActivityItem["kind"], string> = {
  SENT: "Sent",
  REPLY: "Reply",
  NOTE: "Note",
};

const inputCls = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
const labelCls = "mb-1 block text-xs text-neutral-500";

type NoteDraft = { id: string | null; date: string; text: string };

// Today as "YYYY-MM-DD", in the viewer's own timezone.
function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

export default function TaskActivityPanel({
  taskId,
  defaultTo,
  composeRecipients,
  mailboxAddresses,
  popup,
  onPopupClose,
  onEmailSent,
}: {
  taskId: string;
  defaultTo: string;
  composeRecipients: ComposeRecipient[];
  mailboxAddresses: Record<Mailbox, string>;
  popup: TaskPopup | null;
  onPopupClose: () => void;
  // The address just emailed — the task's address from now on.
  onEmailSent: (to: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [activity, setActivity] = useState<TaskActivityItem[] | null>(null);
  const [activityError, setActivityError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  // A note being edited (its Edit action) — separate from `popup`, which
  // only ever opens a new one.
  const [editingNote, setEditingNote] = useState<NoteDraft | null>(null);

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

  const refresh = () => setRefreshKey((k) => k + 1);

  const handlePopupDone = () => {
    onPopupClose();
    refresh();
  };

  const handleNoteEdited = () => {
    setEditingNote(null);
    refresh();
  };

  // Returns false if the confirm was cancelled, so a full swipe puts the
  // row back (see SwipeRow).
  const handleDeleteNote = (id: string): boolean => {
    if (!confirm("Delete this note? This can't be undone.")) return false;
    setSwipedId(null);
    startTransition(async () => {
      await deleteTaskNote(id);
      refresh();
    });
    return true;
  };

  const renderRow = (item: TaskActivityItem) => {
    const who =
      item.kind === "SENT" ? item.toAddress : item.kind === "REPLY" ? item.fromName || item.fromAddress : null;
    const title = item.kind === "NOTE" ? item.text.split("\n")[0] : item.subject || "(no subject)";
    const body = item.kind === "NOTE" ? item.text : item.body;
    return (
      <>
        <button
          type="button"
          onClick={() => setOpenItemId(openItemId === item.id ? null : item.id)}
          className="block w-full px-3 py-2 text-left hover:bg-neutral-50"
        >
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <span className="truncate text-sm text-neutral-700">
              <span className="mr-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                {TAG_LABELS[item.kind]}
              </span>
              {who ?? title}
            </span>
            <span className="shrink-0 text-[10px] text-neutral-400">
              {item.kind === "NOTE" ? formatDate(item.date) : formatDateTime(item.at)}
            </span>
          </div>
          {who && <p className="truncate text-xs text-neutral-500">{title}</p>}
        </button>
        {openItemId === item.id && (
          <p className="whitespace-pre-wrap px-3 pb-3 text-sm text-neutral-700 [overflow-wrap:anywhere]">
            {body || "(empty)"}
          </p>
        )}
      </>
    );
  };

  return (
    <div className="mx-auto mt-6 max-w-xl space-y-3 border-t border-neutral-200 pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Activity</p>

      {popup === "email" && (
        <TaskEmailCompose
          taskId={taskId}
          defaultTo={defaultTo}
          composeRecipients={composeRecipients}
          mailboxAddresses={mailboxAddresses}
          onSent={(to) => {
            onEmailSent(to);
            handlePopupDone();
          }}
          onCancel={onPopupClose}
        />
      )}
      {popup === "note" && (
        <TaskNoteForm
          taskId={taskId}
          initial={{ id: null, date: today(), text: "" }}
          onSaved={handlePopupDone}
          onCancel={onPopupClose}
        />
      )}
      {editingNote && (
        <TaskNoteForm
          taskId={taskId}
          initial={editingNote}
          onSaved={handleNoteEdited}
          onCancel={() => setEditingNote(null)}
        />
      )}

      {activityError ? (
        <p className="text-sm text-red-600">The activity couldn&apos;t be loaded. Please try again.</p>
      ) : !activity ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : activity.length === 0 ? (
        <p className="text-sm text-neutral-400">Nothing yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-md border border-neutral-200">
          {activity.map((item) => (
            <li key={item.id}>
              {item.kind === "NOTE" ? (
                <SwipeRow
                  open={swipedId === item.id}
                  onOpenChange={(open) => setSwipedId(open ? item.id : null)}
                  busy={isPending}
                  actions={[
                    {
                      label: "Edit",
                      icon: <EditIcon />,
                      // Editing doesn't remove the row, so after a full
                      // swipe it always slides back (see SwipeRow).
                      onClick: () => {
                        setEditingNote({ id: item.id, date: item.date, text: item.text });
                        return false;
                      },
                    },
                    { label: "Delete", icon: <TrashIcon />, danger: true, onClick: () => handleDeleteNote(item.id) },
                  ]}
                >
                  {renderRow(item)}
                </SwipeRow>
              ) : (
                renderRow(item)
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The email window — only mounted while open, so each time it opens it
// starts afresh from the task's email address at that moment.
function TaskEmailCompose({
  taskId,
  defaultTo,
  composeRecipients,
  mailboxAddresses,
  onSent,
  onCancel,
}: {
  taskId: string;
  defaultTo: string;
  composeRecipients: ComposeRecipient[];
  mailboxAddresses: Record<Mailbox, string>;
  onSent: (to: string) => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pillCls = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition ${
      active ? "bg-neutral-200 text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
    }`;

  const dirty = subject.trim() !== "" || body.trim() !== "";

  const handleClose = () => {
    if (isPending) return;
    if (dirty && !confirm("Close without sending what you've typed?")) return;
    onCancel();
  };

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
      onSent(to.trim());
    });
  };

  return (
    <PopupWindow title="New email" busy={isPending} onClose={handleClose}>
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
          placeholder="Type an address, or pick from the list"
          className={inputCls}
        />
        <datalist id="task-email-recipients">
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
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className={inputCls} />
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

// The note window (2026-09-28) — a new note, or an existing one to edit.
function TaskNoteForm({
  taskId,
  initial,
  onSaved,
  onCancel,
}: {
  taskId: string;
  initial: NoteDraft;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState(initial.date);
  const [text, setText] = useState(initial.text);
  const [error, setError] = useState<string | null>(null);

  const dirty = date !== initial.date || text !== initial.text;

  const handleClose = () => {
    if (isPending) return;
    if (dirty && !confirm("Close without saving this note?")) return;
    onCancel();
  };

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await saveTaskNote({ id: initial.id, taskId, date, text: capitaliseParagraphs(text) });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
    });
  };

  return (
    <PopupWindow title={initial.id ? "Edit activity" : "New activity"} busy={isPending} onClose={handleClose}>
      <div className="w-40">
        <label className={labelCls}>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Activity</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="What was done"
          className={inputCls}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ActionPanel>
        <ActionButton onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </ActionButton>
      </ActionPanel>
    </PopupWindow>
  );
}
