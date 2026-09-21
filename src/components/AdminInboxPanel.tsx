"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getThread,
  sendInboxReply,
  getSentList,
  deleteInboundEmail,
  deleteOutboundEmail,
  type InboxSummaryItem,
  type InboxThreadItem,
  type SentSummaryItem,
} from "@/lib/actions/inboundEmail";
import { sendAdminEmail, type ComposeRecipient } from "@/lib/actions/adminEmail";
import {
  getCompletedTasks,
  saveTask,
  deleteCompletedTask,
  type TaskItem,
  type TaskInput,
} from "@/lib/actions/tasks";
import { dismissAlert } from "@/lib/actions/subscriptions";
import { refreshOpenAlerts } from "@/lib/actions/clientAlerts";
import type { AlertItem } from "@/lib/alerts";
import type { ClientPanelData } from "@/lib/clientPanelData";
import { ALERT_TYPE_LABELS } from "@/lib/alertLabels";
import { formatDate, formatDateTime } from "@/lib/formatDate";
import { capitaliseParagraphs } from "@/lib/text";
import TaskForm from "@/components/TaskForm";
import AlertDetail from "@/components/AlertDetail";
import AlertClientPanel from "@/components/AlertClientPanel";
import SaleModal from "@/components/SaleModal";

// The unified admin inbox (2026-09-05, Email Integration) — "one box
// with a filter" (direct decision): every reply received at any
// @jevca.art address in one list, filterable by artist/gallery, with a
// thread view (received + any replies sent from here) and a reply box.
// "New message" opens the same compose form used for ad hoc admin
// emails — kept inline here rather than a separate modal component,
// since this is the only place either flow is used.
//
// Two columns plus a modal (2026-09-19, CRM Phase 1–3 — see mock-ups):
// the left column lists what needs attention, and the right "Processed"
// column lists what's been dealt with. Whatever is opened — a message
// thread, a sent item, the compose form, a task, an alert — appears in a
// modal over both columns rather than a third column, so the two lists
// always have room to breathe and the screen works on an iPad.
//
// A pill toggle at the top of the left column (Inbox | Task | Alert)
// switches the whole screen between three modes, and the right column
// follows it:
//   - Inbox mode: left = received messages, right = Sent list
//     (every OutboundEmail — admin sends, replies, and invoice/receipt/
//     certificate sends too, see getSentList).
//   - Task mode (CRM Phase 2): left = open tasks, modal = task form,
//     right = Done list (completed tasks, each deletable from the list).
//   - Alert mode (CRM Phase 3): left = open alerts (this replaced the
//     old standalone Alerts page), modal = the selected alert, right =
//     the same Done list. A payment-overdue alert opens the client's
//     Owner/Domain/Subscription cards with an action panel (see
//     AlertClientPanel); an overdue-invoice alert opens the same sale
//     modal as Consolidated Sales (see SaleModal), as does a sale alert
//     raised by the Studio app — which, being only for information, can
//     also be deleted straight from the list; every other alert shows its
//     message with a link and, where allowed, Dismiss (see AlertDetail).
//
// The left column has two filters side by side: the artist filter (all
// modes) and, in Task and Alert modes, a type filter — task category or
// alert type (2026-09-20). Received messages have no type, so Inbox mode
// has no type filter. The type filter is plain client state applied to
// the lists already loaded; the artist filter lives in the URL (so links
// can land already filtered) and is applied on the server. The right
// column has its own artist filter, independent of the left, also plain
// client state. The selected alert also lives in the URL (?alert=...) —
// see the note on InboxPage — so closing the modal on an alert has to
// clear it from the address too. (The exception is a sale alert, which
// is plain client state: the sale modal loads its own data, and has to
// stay open even after the alert itself clears — e.g. once the sale is
// marked paid.) Clicking a sent item shows its full content in the modal
// — no server round-trip needed, since the full body is already in the
// list.
//
// Tapping outside the modal closes it. If a form has something typed in
// it that hasn't been saved or sent (compose, task, or a reply), that
// asks first, so a stray tap can't throw the typing away.
//
// Text is capitalised paragraph by paragraph (2026-09-20, see
// capitaliseParagraphs): what's typed as it's saved or sent (task
// description, new message, reply), and what's shown in the lists and
// alerts.
//
// In each list, an item's date sits beside its title on a tablet or
// wider, and under it on a phone (below Tailwind's `sm`).
//
// Delete added 2026-09-06, direct request ("enable deleting of messages
// in inbox both received and sent") — every item in a thread (both the
// original received message and any replies) and every Sent item gets
// its own delete control, each with a confirm() first since this is
// permanent, same pattern as every other destructive action in the app
// (handleResetSalesData, handleDeletePayment, etc. elsewhere). Done
// tasks got the same in the list itself (2026-09-20).
//
// Auto-select-next added same day, second delete-related request —
// deleting the message currently open (an inbox thread's original
// message, or a selected Sent item) moves straight to whichever item
// was next in that same list, rather than closing the modal. "Next" is
// worked out from the list as it stood immediately before the delete,
// falling back to the previous item if the deleted one was last, and to
// nothing only once the list is genuinely empty.
//
// Plain, minimalist styling, consistent with InvoiceEmailModal/
// SiteSettingsPanel elsewhere in the app — no separate visual language
// for this screen.

const KIND_LABELS: Record<string, string> = {
  ADMIN: "Message",
  REPLY: "Reply",
  INVOICE: "Invoice",
  RECEIPT: "Receipt",
  CERTIFICATE: "Certificate",
};

type Mode = "inbox" | "task" | "alert";

const EMPTY_TASK_FORM: TaskInput = {
  id: null,
  name: "",
  description: "",
  targetDate: "",
  category: "",
  artistId: "",
};

// The Inbox's address, with the left-hand artist filter and (optionally)
// the selected alert carried in the query string.
function inboxUrl(artistId: string | null, alertId?: string): string {
  const params = new URLSearchParams();
  if (artistId) params.set("artistId", artistId);
  if (alertId) params.set("alert", alertId);
  const qs = params.toString();
  return qs ? `/accounts/inbox?${qs}` : "/accounts/inbox";
}

export default function AdminInboxPanel({
  initialList,
  initialTasks,
  initialAlerts,
  selectedAlertId,
  clientPanel,
  taskCategories,
  artistOptions,
  selectedArtistId,
  composeRecipients,
  adminEmailAddress,
}: {
  initialList: InboxSummaryItem[];
  initialTasks: TaskItem[];
  initialAlerts: AlertItem[];
  selectedAlertId: string | null;
  clientPanel: ClientPanelData | null;
  taskCategories: string[];
  artistOptions: { id: string; name: string }[];
  selectedArtistId: string | null;
  composeRecipients: ComposeRecipient[];
  adminEmailAddress: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Opens straight into Alert mode if the address already names an alert
  // (e.g. after a page reload).
  const [mode, setMode] = useState<Mode>(selectedAlertId ? "alert" : "inbox");

  // The left column's type filter: a task category in Task mode, an alert
  // type in Alert mode. "" = all. Cleared whenever the mode changes.
  const [typeFilter, setTypeFilter] = useState("");

  // Right-hand column: Sent list (Inbox mode) or Done list (Task and
  // Alert modes). `null` means "still loading". One artist filter serves
  // both.
  const [sentList, setSentList] = useState<SentSummaryItem[] | null>(null);
  const [doneList, setDoneList] = useState<TaskItem[] | null>(null);
  const [rightArtistId, setRightArtistId] = useState<string | null>(null);
  const [rightRefreshKey, setRightRefreshKey] = useState(0);
  const [selectedSentId, setSelectedSentId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<InboxThreadItem[] | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const [composing, setComposing] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeArtistId, setComposeArtistId] = useState<string | null>(null);
  const [composeCustomerId, setComposeCustomerId] = useState<string | null>(null);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [composeSent, setComposeSent] = useState(false);

  // `null` = no task open. `taskDirty` = something has been typed since
  // it was opened (drives the discard warning on tap-outside).
  const [taskForm, setTaskForm] = useState<TaskInput | null>(null);
  const [taskDirty, setTaskDirty] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  // The overdue-invoice alert whose sale modal is open, if any. Kept as
  // a copy of the alert (rather than looked up in the list) so the modal
  // stays open even after the alert itself clears.
  const [saleAlert, setSaleAlert] = useState<AlertItem | null>(null);

  const cardCls = "rounded-lg border border-neutral-200 bg-white";
  const inputCls = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs text-neutral-500";
  const deleteBtnCls = "text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50";
  const pillWrapCls = "mb-3 inline-flex w-fit rounded-full border border-neutral-300 bg-white p-1";
  const pillCls = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition ${
      active ? "bg-neutral-200 text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
    }`;
  // The title row of a list item: date beside the title on a tablet or
  // wider, under it on a phone.
  const itemHeadCls =
    "flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2";

  const selectedSent = sentList?.find((s) => s.id === selectedSentId) || null;
  const selectedAlert = initialAlerts.find((a) => a.id === selectedAlertId) || null;

  // The left column's lists, after the type filter.
  const visibleTasks = typeFilter ? initialTasks.filter((t) => t.category === typeFilter) : initialTasks;
  const visibleAlerts = typeFilter ? initialAlerts.filter((a) => a.type === typeFilter) : initialAlerts;
  const typeOptions =
    mode === "task"
      ? taskCategories.map((c) => ({ value: c, label: c }))
      : Object.entries(ALERT_TYPE_LABELS).map(([value, label]) => ({ value, label }));

  // Whether the modal is showing (a sale alert's modal is separate —
  // SaleModal draws its own overlay), and whether it holds typing that
  // hasn't been saved or sent.
  const modalOpen =
    mode === "alert"
      ? !!(clientPanel || selectedAlert)
      : mode === "task"
        ? taskForm !== null
        : composing || selectedSent !== null || openId !== null;
  const hasUnsavedInput =
    mode === "task"
      ? taskDirty
      : mode === "inbox"
        ? (composing &&
            !composeSent &&
            (composeTo.trim() !== "" || composeSubject.trim() !== "" || composeBody.trim() !== "")) ||
          (openId !== null && replyBody.trim() !== "")
        : false;

  const refreshRight = () => setRightRefreshKey((k) => k + 1);

  // Loads whichever list the right-hand column is currently showing —
  // on first render, when the mode or the right-hand artist filter
  // changes, and after something is sent/completed from this screen.
  useEffect(() => {
    let cancelled = false;
    if (mode === "inbox") {
      getSentList(rightArtistId || undefined).then((rows) => {
        if (!cancelled) setSentList(rows);
      });
    } else {
      getCompletedTasks(rightArtistId || undefined).then((rows) => {
        if (!cancelled) setDoneList(rows);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [mode, rightArtistId, rightRefreshKey]);

  // Closes the modal, whatever it is showing. An open alert is also
  // dropped from the address, so the server stops loading its client
  // panel.
  const closeModal = () => {
    setOpenId(null);
    setThread(null);
    setSelectedSentId(null);
    setComposing(false);
    setTaskForm(null);
    setSaleAlert(null);
    if (selectedAlertId) router.replace(inboxUrl(selectedArtistId));
  };

  // Tapping outside the modal: closes it, after checking first if
  // there's unsaved typing that would be lost.
  const handleBackdropClick = () => {
    if (hasUnsavedInput && !confirm("Close without saving what you've typed?")) return;
    closeModal();
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setTypeFilter("");
    closeModal();
  };

  const openThread = (id: string) => {
    setOpenId(id);
    setSelectedSentId(null);
    setComposing(false);
    setThread(null);
    setThreadLoading(true);
    setReplyError(null);
    setReplyBody("");
    getThread(id).then((items) => {
      setThread(items);
      setThreadLoading(false);
      // Marking a message read (inside getThread) can clear an open Alert
      // for that artist — refresh so the Alerts badge in the nav catches
      // up without needing a manual reload.
      router.refresh();
    });
  };

  const openSent = (id: string) => {
    setSelectedSentId(id);
    setOpenId(null);
    setThread(null);
    setComposing(false);
  };

  const handleLeftFilterChange = (value: string) => {
    router.push(inboxUrl(value || null));
  };

  const handleRightFilterChange = (value: string) => {
    setRightArtistId(value || null);
    setSelectedSentId(null);
  };

  const handleSendReply = () => {
    if (!openId) return;
    setReplyError(null);
    setReplySending(true);
    const fd = new FormData();
    fd.set("body", capitaliseParagraphs(replyBody));
    startTransition(async () => {
      const res = await sendInboxReply(openId, fd);
      setReplySending(false);
      if (!res.ok) {
        setReplyError(res.error);
        return;
      }
      setReplyBody("");
      refreshRight();
      openThread(openId); // Reload the thread so the new reply shows up.
    });
  };

  // Deletes one item from an open thread. Deleting the original received
  // message (direction IN) deletes the whole thread, so this moves
  // straight on to whichever message was next in the Inbox list (or the
  // previous one if this was the last, or closes the modal only once the
  // list is genuinely empty). Deleting a reply (direction OUT) just
  // removes that reply and reloads the same thread underneath it.
  const handleDeleteThreadItem = (item: InboxThreadItem) => {
    const confirmMsg =
      item.direction === "IN"
        ? "Delete this message? Any replies to it will stay in the Sent list, just no longer linked to it. This can't be undone."
        : "Delete this reply? This can't be undone.";
    if (!confirm(confirmMsg)) return;

    if (item.direction === "IN") {
      // Worked out from the list as it stands right now, before the
      // delete actually happens — the list itself only updates once
      // router.refresh() below completes.
      const idx = initialList.findIndex((m) => m.id === item.id);
      const remaining = initialList.filter((m) => m.id !== item.id);
      const nextId = remaining[idx]?.id ?? remaining[idx - 1]?.id ?? null;

      setDeletingId(item.id);
      startTransition(async () => {
        await deleteInboundEmail(item.id);
        setDeletingId(null);
        if (nextId) {
          openThread(nextId); // Also refreshes the list underneath.
        } else {
          setOpenId(null);
          setThread(null);
          router.refresh();
        }
      });
    } else {
      setDeletingId(item.id);
      startTransition(async () => {
        await deleteOutboundEmail(item.id);
        setDeletingId(null);
        refreshRight();
        if (openId) openThread(openId);
      });
    }
  };

  const handleDeleteSentItem = (id: string) => {
    if (!confirm("Delete this message? This can't be undone.")) return;
    const currentList = sentList || [];
    const idx = currentList.findIndex((s) => s.id === id);
    const remaining = currentList.filter((s) => s.id !== id);
    // Moves on to whichever item was next, or the previous one if this
    // was the last, rather than closing the modal.
    const nextSelectedId =
      selectedSentId === id ? remaining[idx]?.id ?? remaining[idx - 1]?.id ?? null : selectedSentId;

    setDeletingId(id);
    startTransition(async () => {
      await deleteOutboundEmail(id);
      setDeletingId(null);
      setSentList(remaining);
      setSelectedSentId(nextSelectedId);
    });
  };

  // Deletes a completed task straight from the Done list, without
  // opening it.
  const handleDeleteDoneTask = (id: string) => {
    if (!confirm("Delete this completed task? This can't be undone.")) return;
    setDeletingId(id);
    startTransition(async () => {
      await deleteCompletedTask(id);
      setDeletingId(null);
      setDoneList((list) => (list ? list.filter((t) => t.id !== id) : list));
    });
  };

  const handleRecipientPick = (value: string) => {
    const match = composeRecipients.find((r) => r.email === value);
    setComposeTo(value);
    setComposeArtistId(match?.artistId || null);
    setComposeCustomerId(match?.customerId || null);
  };

  const handleSendCompose = () => {
    setComposeError(null);
    setComposeSending(true);
    const fd = new FormData();
    fd.set("to", composeTo);
    fd.set("subject", composeSubject);
    fd.set("body", capitaliseParagraphs(composeBody));
    if (composeArtistId) fd.set("artistId", composeArtistId);
    if (composeCustomerId) fd.set("customerId", composeCustomerId);
    startTransition(async () => {
      const res = await sendAdminEmail(fd);
      setComposeSending(false);
      if (!res.ok) {
        setComposeError(res.error);
        return;
      }
      setComposeSent(true);
      refreshRight();
      router.refresh();
    });
  };

  const startCompose = () => {
    setOpenId(null);
    setThread(null);
    setSelectedSentId(null);
    setComposing(true);
    setComposeTo("");
    setComposeArtistId(null);
    setComposeCustomerId(null);
    setComposeSubject("");
    setComposeBody("");
    setComposeError(null);
    setComposeSent(false);
  };

  const openTask = (t: TaskItem) => {
    setTaskForm({
      id: t.id,
      name: t.name,
      description: t.description ?? "",
      targetDate: t.targetDate ?? "",
      category: t.category ?? "",
      artistId: t.artistId ?? "",
    });
    setTaskDirty(false);
    setTaskError(null);
  };

  const startTask = () => {
    setTaskForm(EMPTY_TASK_FORM);
    setTaskDirty(false);
    setTaskError(null);
  };

  const handleTaskChange = (patch: Partial<TaskInput>) => {
    setTaskForm((f) => (f ? { ...f, ...patch } : f));
    setTaskDirty(true);
  };

  // Save Task saves (or creates) the task and closes the modal; Task
  // Completed does the same and completes it too, so it moves from the
  // open list on the left into Done on the right.
  const handleSaveTask = (complete: boolean) => {
    if (!taskForm) return;
    setTaskError(null);
    setTaskSaving(true);
    startTransition(async () => {
      const res = await saveTask(
        { ...taskForm, description: capitaliseParagraphs(taskForm.description) },
        complete
      );
      setTaskSaving(false);
      if (!res.ok) {
        setTaskError(res.error);
        return;
      }
      router.refresh();
      setTaskForm(null);
      if (complete) refreshRight();
    });
  };

  // A sale alert opens the sale modal straight away; every other alert
  // goes into the address, so the server can load what its modal needs.
  const openAlert = (a: AlertItem) => {
    if (a.sale) {
      setSaleAlert(a);
      return;
    }
    router.push(inboxUrl(selectedArtistId, a.id));
  };

  // An alert's link normally leaves this screen for the page where it
  // can be dealt with; the exception is a link back to the Inbox itself
  // (a new-email-reply alert), which switches this screen to Inbox mode.
  const handleAlertLink = (a: AlertItem) => {
    if (!a.linkHref) return;
    if (a.linkHref.startsWith("/accounts/inbox")) {
      setMode("inbox");
      setTypeFilter("");
      setOpenId(null);
      setThread(null);
      setSelectedSentId(null);
      setComposing(false);
      setTaskForm(null);
    }
    router.push(a.linkHref);
  };

  const handleAlertDismiss = (a: AlertItem) => {
    startTransition(async () => {
      await dismissAlert(a.id);
      router.push(inboxUrl(selectedArtistId));
    });
  };

  // Deletes an alert straight from the list, without opening it — for the
  // sale alerts, which are only there for information.
  const handleAlertDelete = (a: AlertItem) => {
    startTransition(async () => {
      await dismissAlert(a.id);
      await refreshOpenAlerts();
      router.refresh();
    });
  };

  // The client was marked up to date — close the modal and show the new
  // entry in Done.
  const handleUpToDateDone = () => {
    refreshRight();
    router.push(inboxUrl(selectedArtistId));
  };

  // Something changed the sale in the sale modal (paid, cancelled,
  // deleted, invoice sent) — bring the Alert list and nav badge up to
  // date.
  const handleSaleChanged = () => {
    refreshOpenAlerts().then(() => router.refresh());
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl gap-6 px-6 py-6">
      {/* ---- LEFT: Inbox / Task / Alert list + filters ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex h-[30px] items-center justify-between">
          <h1 className="text-xl font-semibold text-neutral-900">Inbox</h1>
          {mode !== "alert" && (
            <button
              type="button"
              onClick={mode === "inbox" ? startCompose : startTask}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
            >
              {mode === "inbox" ? "New message" : "New Task"}
            </button>
          )}
        </div>

        <div className={pillWrapCls}>
          <button type="button" onClick={() => switchMode("inbox")} className={pillCls(mode === "inbox")}>
            Inbox
          </button>
          <button type="button" onClick={() => switchMode("task")} className={pillCls(mode === "task")}>
            Task
          </button>
          <button type="button" onClick={() => switchMode("alert")} className={pillCls(mode === "alert")}>
            Alert
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          <select
            value={selectedArtistId || ""}
            onChange={(e) => handleLeftFilterChange(e.target.value)}
            className={`${inputCls} min-w-0 flex-1`}
          >
            <option value="">All artists</option>
            {artistOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {mode !== "inbox" && (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={`${inputCls} min-w-0 flex-1`}
            >
              <option value="">All types</option>
              {typeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className={`${cardCls} flex-1 overflow-y-auto`}>
          {mode === "inbox" ? (
            initialList.length === 0 ? (
              <p className="p-4 text-center text-sm text-neutral-400">Nothing here yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {initialList.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => openThread(m.id)}
                      className={`block w-full px-3 py-2.5 text-left hover:bg-neutral-50 ${
                        openId === m.id ? "bg-neutral-100" : ""
                      }`}
                    >
                      <div className={itemHeadCls}>
                        <span
                          className={`truncate text-sm ${m.isRead ? "text-neutral-600" : "font-semibold text-neutral-900"}`}
                        >
                          {m.fromName || m.fromAddress}
                        </span>
                        <span className="shrink-0 text-[10px] text-neutral-400">
                          {formatDate(m.receivedAt)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-neutral-500">
                        {capitaliseParagraphs(m.subject) || "(no subject)"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-neutral-400">
                        {m.artistName ? `${m.artistName}${m.customerName ? ` — ${m.customerName}` : ""}` : "General"}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : mode === "task" ? (
            visibleTasks.length === 0 ? (
              <p className="p-4 text-center text-sm text-neutral-400">
                {initialTasks.length === 0 ? "No open tasks." : "Nothing matches this filter."}
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {visibleTasks.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => openTask(t)}
                      className={`block w-full px-3 py-2.5 text-left hover:bg-neutral-50 ${
                        taskForm?.id === t.id ? "bg-neutral-100" : ""
                      }`}
                    >
                      <div className={itemHeadCls}>
                        <span className="truncate text-sm font-semibold text-neutral-900">
                          {capitaliseParagraphs(t.name)}
                        </span>
                        <span className="shrink-0 text-[10px] text-neutral-400">
                          {t.targetDate ? formatDate(t.targetDate) : ""}
                        </span>
                      </div>
                      <p className="truncate text-xs text-neutral-500">{t.category || "No category"}</p>
                      <p className="mt-0.5 truncate text-xs text-neutral-400">{t.artistName || "General"}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : visibleAlerts.length === 0 ? (
            <p className="p-4 text-center text-sm text-neutral-400">
              {initialAlerts.length === 0 ? "Nothing needs your attention." : "Nothing matches this filter."}
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {visibleAlerts.map((a) => (
                <li key={a.id} className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => openAlert(a)}
                    className={`block min-w-0 flex-1 px-3 py-2.5 text-left hover:bg-neutral-50 ${
                      selectedAlertId === a.id || saleAlert?.id === a.id ? "bg-neutral-100" : ""
                    }`}
                  >
                    <div className={itemHeadCls}>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            a.severity === "CRITICAL" ? "bg-red-500" : "bg-amber-400"
                          }`}
                        />
                        <span className="truncate text-sm font-semibold text-neutral-900">
                          {ALERT_TYPE_LABELS[a.type] || a.type}
                        </span>
                      </span>
                      {new Date(a.createdAt).getTime() > 0 && (
                        <span className="shrink-0 text-[10px] text-neutral-400">
                          {formatDate(a.createdAt)}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-neutral-500">{a.artistName || "General"}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-neutral-400">
                      {capitaliseParagraphs(a.message)}
                    </p>
                  </button>
                  {/* Sale alerts are only there for information, so they can be
                      deleted straight from the list. */}
                  {a.sale && a.dismissable && (
                    <button
                      type="button"
                      onClick={() => handleAlertDelete(a)}
                      disabled={isPending}
                      className={`shrink-0 px-3 ${deleteBtnCls}`}
                    >
                      Delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ---- RIGHT: Processed (Sent list or Done list, own filter) ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex h-[30px] items-center">
          <h2 className="text-xl font-semibold text-neutral-900">Processed</h2>
        </div>

        <div className={pillWrapCls}>
          <span className={pillCls(true)}>{mode === "inbox" ? "Sent" : "Done"}</span>
        </div>

        <select
          value={rightArtistId || ""}
          onChange={(e) => handleRightFilterChange(e.target.value)}
          className={`${inputCls} mb-3`}
        >
          <option value="">All artists</option>
          {artistOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <div className={`${cardCls} flex-1 overflow-y-auto`}>
          {mode === "inbox" ? (
            !sentList ? (
              <p className="p-4 text-center text-sm text-neutral-400">Loading…</p>
            ) : sentList.length === 0 ? (
              <p className="p-4 text-center text-sm text-neutral-400">Nothing sent yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {sentList.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => openSent(m.id)}
                      className={`block w-full px-3 py-2.5 text-left hover:bg-neutral-50 ${
                        selectedSentId === m.id ? "bg-neutral-100" : ""
                      }`}
                    >
                      <div className={itemHeadCls}>
                        <span className="truncate text-sm text-neutral-700">{m.toAddress}</span>
                        <span className="shrink-0 text-[10px] text-neutral-400">
                          {formatDate(m.sentAt)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-neutral-500">
                        <span className="mr-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                          {KIND_LABELS[m.kind] || m.kind}
                        </span>
                        {capitaliseParagraphs(m.subject) || "(no subject)"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-neutral-400">
                        {[m.artistName, m.customerName || m.artworkTitle].filter(Boolean).join(" — ") || "—"}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : !doneList ? (
            <p className="p-4 text-center text-sm text-neutral-400">Loading…</p>
          ) : doneList.length === 0 ? (
            <p className="p-4 text-center text-sm text-neutral-400">Nothing completed yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {doneList.map((t) => (
                <li key={t.id} className="px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-neutral-900">
                      {capitaliseParagraphs(t.name)}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleDeleteDoneTask(t.id)}
                      disabled={deletingId === t.id || isPending}
                      className={`shrink-0 ${deleteBtnCls}`}
                    >
                      {deletingId === t.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                  <p className="truncate text-xs text-neutral-500">{t.category || "No category"}</p>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-neutral-400">
                    <span>Date completed</span>
                    <span className="text-[10px]">{t.completedAt ? formatDate(t.completedAt) : ""}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ---- SALE MODAL: an overdue-invoice alert (same as Consolidated Sales) ---- */}
      {saleAlert?.sale && (
        <SaleModal
          key={saleAlert.sale.purchaseId}
          target={saleAlert.sale}
          onClose={() => setSaleAlert(null)}
          onChanged={handleSaleChanged}
        />
      )}

      {/* ---- MODAL: alert, task form, thread, sent detail, or compose ---- */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={handleBackdropClick}
        >
          <div
            className={`flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-lg ${
              mode === "alert" && clientPanel ? "max-w-5xl" : "max-w-2xl"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 justify-end border-b border-neutral-100 px-4 py-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {mode === "alert" ? (
                clientPanel ? (
                  <AlertClientPanel key={clientPanel.artist.id} data={clientPanel} onDone={handleUpToDateDone} />
                ) : (
                  selectedAlert && (
                    <AlertDetail
                      item={selectedAlert}
                      busy={isPending}
                      onLink={handleAlertLink}
                      onDismiss={handleAlertDismiss}
                    />
                  )
                )
              ) : mode === "task" ? (
                taskForm && (
                  <TaskForm
                    form={taskForm}
                    categories={taskCategories}
                    artistOptions={artistOptions}
                    saving={taskSaving || isPending}
                    error={taskError}
                    onChange={handleTaskChange}
                    onSave={() => handleSaveTask(false)}
                    onComplete={() => handleSaveTask(true)}
                  />
                )
              ) : composing ? (
                <div className="mx-auto max-w-xl space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    New message — from {adminEmailAddress}
                  </p>
                  {composeSent ? (
                    <p className="text-sm text-green-600">Sent to {composeTo}.</p>
                  ) : (
                    <>
                      <div>
                        <label className={labelCls}>To</label>
                        <input
                          list="compose-recipients"
                          type="email"
                          value={composeTo}
                          onChange={(e) => handleRecipientPick(e.target.value)}
                          placeholder="Type an address, or pick from the list"
                          className={inputCls}
                        />
                        <datalist id="compose-recipients">
                          {composeRecipients.map((r) => (
                            <option key={`${r.artistId || "c"}-${r.email}`} value={r.email}>
                              {r.label}
                            </option>
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label className={labelCls}>Subject</label>
                        <input
                          type="text"
                          value={composeSubject}
                          onChange={(e) => setComposeSubject(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Message</label>
                        <textarea
                          value={composeBody}
                          onChange={(e) => setComposeBody(e.target.value)}
                          rows={10}
                          className={inputCls}
                        />
                      </div>
                      {composeError && <p className="text-sm text-red-600">{composeError}</p>}
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleSendCompose}
                          disabled={composeSending || isPending}
                          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                        >
                          {composeSending ? "Sending…" : "Send"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : selectedSent ? (
                <div className="mx-auto max-w-xl space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                      {KIND_LABELS[selectedSent.kind] || selectedSent.kind}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteSentItem(selectedSent.id)}
                      disabled={deletingId === selectedSent.id || isPending}
                      className={deleteBtnCls}
                    >
                      {deletingId === selectedSent.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                  <p className="text-sm font-medium text-neutral-800">{selectedSent.subject || "(no subject)"}</p>
                  <p className="text-xs text-neutral-400">
                    {selectedSent.fromAddress} → {selectedSent.toAddress}
                  </p>
                  <p className="text-xs text-neutral-400">{formatDateTime(selectedSent.sentAt)}</p>
                  {(selectedSent.artistName || selectedSent.customerName || selectedSent.artworkTitle) && (
                    <p className="text-xs text-neutral-400">
                      {[selectedSent.artistName, selectedSent.customerName, selectedSent.artworkTitle]
                        .filter(Boolean)
                        .join(" — ")}
                    </p>
                  )}
                  <div className="mt-3 whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
                    {selectedSent.body || "(empty)"}
                  </div>
                </div>
              ) : threadLoading || !thread ? (
                <p className="text-sm text-neutral-400">Loading…</p>
              ) : (
                <div className="mx-auto max-w-xl space-y-4">
                  {thread.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-md border p-3 ${
                        item.direction === "OUT" ? "border-neutral-200 bg-neutral-50" : "border-neutral-200 bg-white"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
                        <span className="font-medium text-neutral-700">
                          {item.direction === "OUT" ? "You" : item.fromName || item.fromAddress}
                        </span>
                        <div className="flex items-center gap-2">
                          <span>{formatDateTime(item.at)}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteThreadItem(item)}
                            disabled={deletingId === item.id || isPending}
                            className={deleteBtnCls}
                          >
                            {deletingId === item.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </div>
                      {item.direction === "IN" && (
                        <p className="mb-1 text-xs text-neutral-400">
                          {item.fromAddress} → {item.toAddress}
                        </p>
                      )}
                      <p className="mb-1 text-sm font-medium text-neutral-800">{item.subject}</p>
                      <p className="whitespace-pre-wrap text-sm text-neutral-700">{item.textBody}</p>
                    </div>
                  ))}

                  <div className="border-t border-neutral-200 pt-3">
                    <label className={labelCls}>Reply</label>
                    <textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      rows={6}
                      className={inputCls}
                    />
                    {replyError && <p className="mt-1 text-sm text-red-600">{replyError}</p>}
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={handleSendReply}
                        disabled={replySending || isPending || !replyBody.trim()}
                        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                      >
                        {replySending ? "Sending…" : "Send reply"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
