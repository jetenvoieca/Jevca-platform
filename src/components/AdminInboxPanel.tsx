"use client";

import { useCallback, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getThread,
  sendInboxReply,
  getSentList,
  archiveInboundEmail,
  unarchiveInboundEmail,
  deleteInboundEmail,
  deleteOutboundEmail,
  type InboxSummaryItem,
  type InboxThreadItem,
  type SentSummaryItem,
} from "@/lib/actions/inboundEmail";
import { sendAdminEmail, forwardEmail, type ComposeRecipient, type ForwardSource } from "@/lib/actions/adminEmail";
import {
  getCompletedTasks,
  saveTask,
  deleteTask,
  reopenTask,
  setTaskToday,
  createTaskFromEmail,
  type TaskItem,
  type TaskInput,
} from "@/lib/actions/tasks";
import { dismissAlert } from "@/lib/actions/subscriptions";
import {
  refreshOpenAlerts,
  getProcessedAlerts,
  deleteProcessedAlert,
  type ProcessedAlertItem,
} from "@/lib/actions/clientAlerts";
import type { AlertItem } from "@/lib/alerts";
import type { ClientPanelData } from "@/lib/clientPanelData";
import type { ClientAlertType } from "@/lib/clientAlertIds";
import type { Mailbox } from "@/lib/email";
import { ALERT_TYPE_LABELS } from "@/lib/alertLabels";
import { formatDate, formatDateTime } from "@/lib/formatDate";
import { capitaliseParagraphs } from "@/lib/text";
import TaskForm from "@/components/TaskForm";
import TaskActivityPanel, { type TaskPopup } from "@/components/TaskActivityPanel";
import AlertDetail from "@/components/AlertDetail";
import AlertClientPanel from "@/components/AlertClientPanel";
import PersonalMailPanel from "@/components/PersonalMailPanel";
import { getPersonalUnreadCount } from "@/lib/actions/gmail";
import EmailBody, { formatFileSize } from "@/components/EmailBody";
import { useEmailTranslation } from "@/components/useEmailTranslation";
import SaleModal from "@/components/SaleModal";
import ForwardEmailPopup from "@/components/ForwardEmailPopup";
import SwipeRow from "@/components/SwipeRow";
import { parisToday, msUntilParisMidnight } from "@/lib/parisTime";
import { MiniActionBar, MiniActionButton } from "@/components/ActionPanel";
import { TaskIcon, ArchiveIcon, UnarchiveIcon, TrashIcon, ReinstateIcon } from "@/components/ActionIcons";

// The unified admin inbox (2026-09-05, Email Integration) — "one box
// with a filter" (direct decision): every message received in one list,
// filterable by artist/gallery, with a thread view (received + any
// replies sent from here) and a reply box. "New message" opens the same
// compose form used for ad hoc admin emails — kept inline here rather
// than a separate modal component, since this is the only place either
// flow is used.
//
// Two columns plus a modal (2026-09-19, CRM Phase 1–3 — see mock-ups):
// the left column lists what needs attention, and the right "Processed"
// column lists what's been dealt with. Whatever is opened — a message
// thread, a sent item, the compose form, a task, an alert — appears in a
// modal over both columns rather than a third column, so the two lists
// always have room to breathe and the screen works on an iPad.
//
// A pill toggle in a band across the top (Art | Business | Personal |
// Alert | Task, each with its count — unread emails, open alerts, open
// tasks; layout 2026-10-10, direct request — see mock-up) switches the
// whole screen between its modes, and both columns follow it. The New
// message / New Task button sits on the Inbox heading's line:
//   - Art and Business (2026-09-27, replacing the single Inbox mode) are
//     the two mailboxes (see lib/email.ts): left = received messages,
//     right = Sent list (every OutboundEmail from that mailbox — in Art
//     that includes invoice/receipt/certificate sends, see getSentList).
//     New messages are sent from the mailbox's own address. Which
//     mailbox's list the server loads is in the URL (?mailbox=business).
//   - Task mode (CRM Phase 2): left = open tasks, modal = task form,
//     right = Done list (completed tasks). A saved task can also send
//     email from itself and shows its Activity — what was sent, the
//     replies linked back to it (2026-09-27), and notes of what was done
//     (2026-09-28); see TaskActivityPanel. Such replies land in the Inbox
//     as usual too, marked Task. There's no Save button (2026-09-28,
//     direct request): a task saves itself when it's closed, before Email
//     or Activity opens its window, and on Completed.
//   - Alert mode (CRM Phase 3): left = open alerts (this replaced the
//     old standalone Alerts page), modal = the selected alert, right =
//     processed alerts — the ones dealt with (2026-09-28, direct request;
//     it used to show the task Done list; see getProcessedAlerts). A
//     payment-overdue or no-payment-method alert opens the client's Owner/Domain/Subscription
//     cards with an action panel (see AlertClientPanel); an
//     overdue-invoice alert opens the same sale
//     modal as Consolidated Sales (see SaleModal), as does a sale alert
//     raised by the Studio app — which, being only for information, can
//     also be deleted straight from the list; every other alert shows its
//     message with a link and, where allowed, Dismiss (see AlertDetail).
//   - Personal mode (2026-10-09): Craig's own Gmail, in a panel of its
//     own — see PersonalMailPanel.
//
// The left column has one filter, beside the Inbox heading, depending on
// the mode — Inbox or Archived in the mail modes (2026-09-27), task
// category or alert type in the other two (2026-09-20). The type filter
// is plain client state applied to the lists already loaded;
// Inbox/Archived lives in the URL and is applied on the server. (The
// artist filters, left and right, were removed 2026-10-10, direct
// request — each row shows its artist anyway.) The selected alert also lives in the
// URL (?alert=...) — see the note on InboxPage — so closing the modal on
// an alert has to clear it from the address too. (The exception is a
// sale alert, which is plain client state: the sale modal loads its own
// data, and has to stay open even after the alert itself clears — e.g.
// once the sale is marked paid.) Clicking a sent item shows its full
// content in the modal — no server round-trip needed, since the full
// body is already in the list.
//
// Archive added 2026-09-27, direct request — a received message can be
// archived or deleted straight from the list, without opening it: swipe
// left on a touchscreen (a short swipe shows the buttons, a full swipe
// archives), or hover with a mouse for a small icon panel (see
// SwipeRow). Archiving also marks it read. In the Archived view the same
// swipe/hover offers Move to Inbox and Delete. Sent messages, open tasks
// and Done tasks can be deleted from their lists the same way (same day,
// direct requests), as can processed alerts — there Delete is the only
// action, so a full swipe deletes (after the usual confirm).
//
// Today (2026-10-09, direct request) — an open task can be marked Today
// from the same swipe/hover on its row (a full swipe marks it). Today's
// tasks sit in a tinted panel at the top of the list, where the button
// reads Not today. The panel empties at midnight Paris time — a task only
// counts as Today while its todayOn is today's date, and `today` below
// moves on by itself at midnight, so a page left open clears too.
//
// Reinstate (2026-10-01, direct request) — a Done task can be put back
// on the open list (see reopenTask), for one completed by mistake: the
// same swipe/hover on its row, beside Delete. A full swipe reinstates,
// so a stray swipe can never delete.
//
// Mini action bar (2026-10-01, direct request — see mock-up): an opened
// email's actions (Show text, Delete, Forward, Make task) sit together
// in a small panel on the right of its header, two to a row, so they no
// longer get lost among its details (see MiniActionBar). Same for an
// opened sent item (Delete, Forward). They keep that order, so each
// button is always in the same place.
//
// Forward (2026-09-28, direct request) — on every message in an opened
// thread and on an opened sent item: opens the Forward window (see
// ForwardEmailPopup) over the modal. Forwards go from the mailbox's own
// shared address and appear in its Sent list.
//
// Make task (2026-09-28, direct request) — on a received message, in the
// list's swipe/hover actions and in the opened message: makes a task from
// it (see createTaskFromEmail) and switches straight to Task mode with the
// new task open. A message already made into a task offers Open task
// instead.
//
// Tapping outside the modal closes it. If a message has something typed
// in it that hasn't been sent (compose or a reply), that asks first, so a
// stray tap can't throw the typing away; a task saves itself instead.
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
// (handleResetSalesData, handleDeletePayment, etc. elsewhere).
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
  TASK: "Task",
  FORWARD: "Forward",
  INVOICE: "Invoice",
  RECEIPT: "Receipt",
  CERTIFICATE: "Certificate",
};

const DELETE_MESSAGE_CONFIRM =
  "Delete this message? Any replies to it will stay in the Sent list, just no longer linked to it. This can't be undone.";

type Mode = "art" | "business" | "task" | "alert" | "personal";

const MODES: { mode: Mode; label: string }[] = [
  { mode: "art", label: "Art" },
  { mode: "business", label: "Business" },
  { mode: "personal", label: "Personal" },
  { mode: "alert", label: "Alert" },
  { mode: "task", label: "Task" },
];

const EMPTY_TASK_FORM: TaskInput = {
  id: null,
  name: "",
  description: "",
  targetDate: "",
  category: "",
  artistId: "",
};

// The mailbox a mail mode shows; null for Task and Alert.
function mailboxOf(mode: Mode): Mailbox | null {
  if (mode === "art") return "ART";
  if (mode === "business") return "BUSINESS";
  return null;
}

// The sale alerts the Studio app raises (SALE_RECORDED, SALE_LINK_CREATED)
// are only there for information, so they can be deleted straight from the
// list — whether or not they know which sale they are about (the earliest
// ones don't). The overdue-invoice alerts share the SALE_ prefix but are
// worked out live and can't be dismissed, so `dismissable` rules them out.
function isInformationalSaleAlert(alert: AlertItem): boolean {
  return alert.dismissable && alert.type.startsWith("SALE_");
}

type InboxUrlParams = {
  mailbox: Mailbox;
  archived: boolean;
  alertId?: string;
};

// The Inbox's address, with the mailbox, Inbox/Archived and (optionally)
// the selected alert in the query string.
function inboxUrl({ mailbox, archived, alertId }: InboxUrlParams): string {
  const params = new URLSearchParams();
  if (mailbox === "BUSINESS") params.set("mailbox", "business");
  if (archived) params.set("archived", "1");
  if (alertId) params.set("alert", alertId);
  const qs = params.toString();
  return qs ? `/accounts/inbox?${qs}` : "/accounts/inbox";
}

export default function AdminInboxPanel({
  mailbox,
  initialList,
  showArchived,
  initialTasks,
  initialToday,
  initialAlerts,
  selectedAlertId,
  clientPanel,
  taskCategories,
  artistOptions,
  unreadCounts,
  composeRecipients,
  mailboxAddresses,
  gmail,
  gmailError,
  openPersonal,
}: {
  mailbox: Mailbox;
  initialList: InboxSummaryItem[];
  showArchived: boolean;
  initialTasks: TaskItem[];
  initialToday: string; // "YYYY-MM-DD", Paris
  initialAlerts: AlertItem[];
  selectedAlertId: string | null;
  // The client cards for a payment-overdue or no-payment-method alert.
  clientPanel: { alertType: ClientAlertType; data: ClientPanelData } | null;
  taskCategories: string[];
  // The task form's Owner options.
  artistOptions: { id: string; name: string }[];
  // Unread received messages in each mailbox's Inbox, for the pills.
  unreadCounts: Record<Mailbox, number>;
  composeRecipients: ComposeRecipient[];
  mailboxAddresses: Record<Mailbox, string>;
  // Craig's own Gmail, for the Personal tab (2026-10-09) — see
  // PersonalMailPanel. `openPersonal` = arrived back from connecting it.
  gmail: { email: string } | null;
  gmailError: string | null;
  openPersonal: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Opens straight into Alert mode if the address already names an alert
  // (e.g. after a page reload), otherwise into the address's mailbox.
  const [mode, setMode] = useState<Mode>(
    openPersonal ? "personal" : selectedAlertId ? "alert" : mailbox === "BUSINESS" ? "business" : "art"
  );
  const modeMailbox = mailboxOf(mode);
  const isMailMode = modeMailbox !== null;
  // Just after switching between Art and Business, until the server has
  // sent the other mailbox's list.
  const listLoading = isMailMode && modeMailbox !== mailbox;

  // The left column's type filter: a task category in Task mode, an alert
  // type in Alert mode. "" = all. Cleared whenever the mode changes.
  const [typeFilter, setTypeFilter] = useState("");

  // Right-hand column: Sent list (mail modes), Done list (Task mode) or
  // processed alerts (Alert mode). `null` means "still loading".
  const [sentList, setSentList] = useState<SentSummaryItem[] | null>(null);
  const [doneList, setDoneList] = useState<TaskItem[] | null>(null);
  const [processedAlerts, setProcessedAlerts] = useState<ProcessedAlertItem[] | null>(null);
  const [rightRefreshKey, setRightRefreshKey] = useState(0);
  const [selectedSentId, setSelectedSentId] = useState<string | null>(null);
  // The item being deleted (from the right-hand column or an open thread)
  // or reinstated (a Done task), while that runs.
  const [busyId, setBusyId] = useState<string | null>(null);

  // The list row (message or task) that's swiped open — at most one
  // across both columns — and the received message or open task being
  // archived/moved/deleted from the left-hand list.
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  // Today's date in Paris, for the Today panel — moves on at midnight.
  const [today, setToday] = useState(initialToday);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const waitForMidnight = () => {
      timer = setTimeout(() => {
        setToday(parisToday());
        waitForMidnight();
      }, msUntilParisMidnight() + 1000);
    };
    waitForMidnight();
    return () => clearTimeout(timer);
  }, []);

  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<InboxThreadItem[] | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  // An email with HTML shows it by default (2026-09-28, direct request —
  // long emails were unreadable as plain text); this is the one switched
  // to plain text with its "Show text" button, if any.
  const [textShownId, setTextShownId] = useState<string | null>(null);
  // Translate / Show original on an opened email (2026-10-09).
  const translation = useEmailTranslation();
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

  // `null` = no task open. `taskDirty` = something has changed since it
  // was opened or last saved (so closing it needs to save).
  const [taskForm, setTaskForm] = useState<TaskInput | null>(null);
  // The address the task's Email window starts with (not on the form —
  // see TaskForm).
  const [taskEmail, setTaskEmail] = useState("");
  const [taskDirty, setTaskDirty] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  // Which of the task's own windows is open, if any — email or note (see
  // TaskActivityPanel).
  const [taskPopup, setTaskPopup] = useState<TaskPopup | null>(null);

  // The email whose Forward window is open, if any.
  const [forwarding, setForwarding] = useState<{
    source: ForwardSource;
    subject: string | null;
    attachmentCount: number;
  } | null>(null);

  // The overdue-invoice alert whose sale modal is open, if any. Kept as
  // a copy of the alert (rather than looked up in the list) so the modal
  // stays open even after the alert itself clears.
  const [saleAlert, setSaleAlert] = useState<AlertItem | null>(null);

  const cardCls = "rounded-lg border border-neutral-200 bg-white";
  const inputCls = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs text-neutral-500";
  const deleteBtnCls = "text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50";
  const pillWrapCls = "inline-flex w-fit rounded-full border border-neutral-300 bg-white p-1";
  const pillCls = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition ${
      active ? "bg-neutral-200 text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
    }`;
  // The title row of a list item: date beside the title on a tablet or
  // wider, under it on a phone.
  const itemHeadCls =
    "flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2";
  // An opened email's header: its details on the left, the mini action
  // bar on the right (under the details on a phone).
  const emailHeadCls = "flex flex-col gap-2 bg-neutral-50 px-3 py-2 sm:flex-row sm:items-stretch";

  const selectedSent = sentList?.find((s) => s.id === selectedSentId) || null;
  const selectedAlert = initialAlerts.find((a) => a.id === selectedAlertId) || null;

  // The left column's lists, after the type filter.
  const visibleTasks = typeFilter ? initialTasks.filter((t) => t.category === typeFilter) : initialTasks;
  const todayTasks = visibleTasks.filter((t) => t.todayOn === today);
  const otherTasks = visibleTasks.filter((t) => t.todayOn !== today);
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
    isMailMode &&
    ((composing &&
      !composeSent &&
      (composeTo.trim() !== "" || composeSubject.trim() !== "" || composeBody.trim() !== "")) ||
      (openId !== null && replyBody.trim() !== ""));

  // A received message is open in the modal (rather than compose or a
  // sent item) — see the sticky message header in the thread view.
  const threadOpen = isMailMode && !composing && !selectedSent && openId !== null;

  // The Inbox's address with the current filters, changed as given.
  const currentUrl = (changes: Partial<InboxUrlParams> = {}) =>
    inboxUrl({ mailbox, archived: showArchived, ...changes });

  const refreshRight = () => setRightRefreshKey((k) => k + 1);

  // Loads whichever list the right-hand column is currently showing —
  // on first render, when the mode changes, and after something is
  // sent/completed from this screen. (Personal loads its own.)
  useEffect(() => {
    let cancelled = false;
    const sentMailbox = mailboxOf(mode);
    if (sentMailbox) {
      getSentList(sentMailbox).then((rows) => {
        if (!cancelled) setSentList(rows);
      });
    } else if (mode === "task") {
      getCompletedTasks().then((rows) => {
        if (!cancelled) setDoneList(rows);
      });
    } else if (mode === "alert") {
      getProcessedAlerts().then((rows) => {
        if (!cancelled) setProcessedAlerts(rows);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [mode, rightRefreshKey]);

  // The Personal pill's count — Gmail's own unread count, asked for once
  // here and again whenever the Personal tab changes something.
  const [personalUnread, setPersonalUnread] = useState<number | null>(null);
  const gmailEmail = gmail?.email ?? null;
  const refreshPersonalUnread = useCallback(() => {
    if (!gmailEmail) return;
    getPersonalUnreadCount()
      .then(setPersonalUnread)
      .catch(() => setPersonalUnread(null));
  }, [gmailEmail]);
  useEffect(() => {
    refreshPersonalUnread();
  }, [refreshPersonalUnread]);

  // Clears whatever the modal is showing.
  const resetModal = () => {
    setOpenId(null);
    setThread(null);
    setSelectedSentId(null);
    setComposing(false);
    setTaskForm(null);
    setTaskPopup(null);
    setForwarding(null);
    setSaleAlert(null);
  };

  // Closes the modal, whatever it is showing. An open alert is also
  // dropped from the address, so the server stops loading its client
  // panel.
  const closeModal = () => {
    resetModal();
    if (selectedAlertId) router.replace(currentUrl());
  };

  // Tapping outside the modal: closes it — an open task saves itself
  // first (see closeTask); otherwise it checks first if there's unsent
  // typing that would be lost.
  const handleBackdropClick = () => {
    if (mode === "task") {
      closeTask();
      return;
    }
    if (hasUnsavedInput && !confirm("Close without saving what you've typed?")) return;
    closeModal();
  };

  // Switching to the other mailbox loads its list (from its Inbox, not
  // Archived) through the address; any other switch just closes the
  // modal, and an open alert's address along with it.
  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setTypeFilter("");
    setSwipedId(null);
    setSentList(null);
    resetModal();
    const nextMailbox = mailboxOf(next);
    if (nextMailbox && nextMailbox !== mailbox) {
      router.push(currentUrl({ mailbox: nextMailbox, archived: false }));
    } else if (selectedAlertId) {
      router.replace(currentUrl());
    }
  };

  const openThread = (id: string) => {
    translation.reset();
    setOpenId(id);
    setSelectedSentId(null);
    setComposing(false);
    setThread(null);
    setThreadLoading(true);
    setThreadError(false);
    setReplyError(null);
    setReplyBody("");
    // A failure here shows a message in the modal rather than leaving it
    // on "Loading…" for good (2026-09-24).
    getThread(id)
      .then((items) => {
        setThread(items);
        // Marking a message read (inside getThread) can clear an open
        // Alert for that artist — refresh so the Alerts badge in the nav
        // catches up without needing a manual reload.
        router.refresh();
      })
      .catch(() => setThreadError(true))
      .finally(() => setThreadLoading(false));
  };

  const openSent = (id: string) => {
    translation.reset();
    setSelectedSentId(id);
    setOpenId(null);
    setThread(null);
    setComposing(false);
  };

  const handleArchivedViewChange = (value: string) => {
    setSwipedId(null);
    router.push(currentUrl({ archived: value === "archived" }));
  };

  // Archive, Move to Inbox, or Delete, straight from the left-hand list
  // (a received message or an open task). The row stays dimmed until the
  // refreshed list arrives without it.
  const runRowAction = (id: string, action: (id: string) => Promise<void>) => {
    setSwipedId(null);
    setRowBusyId(id);
    startTransition(async () => {
      await action(id);
      router.refresh();
    });
  };

  const handleDeleteRow = (id: string) => {
    if (!confirm(DELETE_MESSAGE_CONFIRM)) return;
    runRowAction(id, deleteInboundEmail);
  };

  // Makes a task from a received message (or finds the one already made)
  // and switches to Task mode with it open.
  const handleMakeTask = (id: string) => {
    setSwipedId(null);
    setRowBusyId(id);
    startTransition(async () => {
      const res = await createTaskFromEmail(id);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      setMode("task");
      setTypeFilter("");
      setSentList(null);
      resetModal();
      openTask(res.task);
      router.refresh();
    });
  };

  // The received message open in the modal, as it appears in the list —
  // for its Make task / Open task button.
  const openListItem = initialList.find((m) => m.id === openId) || null;

  // Deletes an open task straight from the list. Returns false if the
  // confirm was cancelled, so a full swipe puts the row back (see
  // SwipeRow).
  const handleDeleteOpenTask = (id: string): boolean => {
    if (!confirm("Delete this task? This can't be undone.")) return false;
    runRowAction(id, deleteTask);
    return true;
  };

  // One row of the open task list — tinted in the Today panel, where its
  // Today button reads Not today.
  const renderOpenTask = (t: TaskItem, isToday: boolean) => (
    <li key={t.id}>
      <SwipeRow
        open={swipedId === t.id}
        onOpenChange={(open) => setSwipedId(open ? t.id : null)}
        busy={isPending && rowBusyId === t.id}
        background={isToday ? "bg-[#F8E8CA]" : "bg-white"}
        actions={[
          {
            label: isToday ? "Not today" : "Today",
            icon: <span className="px-1.5 text-xs uppercase">{isToday ? "Not today" : "Today"}</span>,
            primary: true,
            onClick: () => runRowAction(t.id, (id) => setTaskToday(id, !isToday)),
          },
          { label: "Delete", icon: <TrashIcon />, danger: true, onClick: () => handleDeleteOpenTask(t.id) },
        ]}
      >
        <button
          type="button"
          onClick={() => openTask(t)}
          className={`block w-full px-3 py-2.5 text-left ${
            isToday
              ? taskForm?.id === t.id
                ? "bg-[#F0DAB0]"
                : "hover:bg-[#F4E0BC]"
              : taskForm?.id === t.id
                ? "bg-neutral-100"
                : "hover:bg-neutral-50"
          }`}
        >
          <div className={itemHeadCls}>
            <span className={`truncate text-sm font-semibold ${isToday ? "text-[#4A3A22]" : "text-neutral-900"}`}>
              {capitaliseParagraphs(t.name)}
            </span>
            <span className={`shrink-0 text-[10px] ${isToday ? "text-[#A8977A]" : "text-neutral-400"}`}>
              {t.targetDate ? formatDate(t.targetDate) : ""}
            </span>
          </div>
          <p className={`truncate text-xs ${isToday ? "text-[#7A6648]" : "text-neutral-500"}`}>
            {t.category || "No category"}
          </p>
          <p className={`mt-0.5 truncate text-xs ${isToday ? "text-[#A8977A]" : "text-neutral-400"}`}>
            {t.artistName || "General"}
          </p>
        </button>
      </SwipeRow>
    </li>
  );

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
  // straight on to whichever message was next in the list (or the
  // previous one if this was the last, or closes the modal only once the
  // list is genuinely empty). Deleting a reply (direction OUT) just
  // removes that reply and reloads the same thread underneath it.
  const handleDeleteThreadItem = (item: InboxThreadItem) => {
    const confirmMsg =
      item.direction === "IN" ? DELETE_MESSAGE_CONFIRM : "Delete this reply? This can't be undone.";
    if (!confirm(confirmMsg)) return;

    if (item.direction === "IN") {
      // Worked out from the list as it stands right now, before the
      // delete actually happens — the list itself only updates once
      // router.refresh() below completes.
      const idx = initialList.findIndex((m) => m.id === item.id);
      const remaining = initialList.filter((m) => m.id !== item.id);
      const nextId = remaining[idx]?.id ?? remaining[idx - 1]?.id ?? null;

      setBusyId(item.id);
      startTransition(async () => {
        await deleteInboundEmail(item.id);
        setBusyId(null);
        if (nextId) {
          openThread(nextId); // Also refreshes the list underneath.
        } else {
          setOpenId(null);
          setThread(null);
          router.refresh();
        }
      });
    } else {
      setBusyId(item.id);
      startTransition(async () => {
        await deleteOutboundEmail(item.id);
        setBusyId(null);
        refreshRight();
        if (openId) openThread(openId);
      });
    }
  };

  // Deletes a sent message — from the open modal, or straight from the
  // Sent list (swipe/hover). Returns false if the confirm was cancelled,
  // so a full swipe puts the row back (see SwipeRow).
  const handleDeleteSentItem = (id: string): boolean => {
    if (!confirm("Delete this message? This can't be undone.")) return false;
    const currentList = sentList || [];
    const idx = currentList.findIndex((s) => s.id === id);
    const remaining = currentList.filter((s) => s.id !== id);
    // Moves on to whichever item was next, or the previous one if this
    // was the last, rather than closing the modal.
    const nextSelectedId =
      selectedSentId === id ? remaining[idx]?.id ?? remaining[idx - 1]?.id ?? null : selectedSentId;

    setSwipedId(null);
    setBusyId(id);
    startTransition(async () => {
      await deleteOutboundEmail(id);
      setBusyId(null);
      setSentList(remaining);
      setSelectedSentId(nextSelectedId);
    });
    return true;
  };

  // Deletes a completed task straight from the Done list (swipe/hover).
  // Returns false if the confirm was cancelled, so a full swipe puts the
  // row back (see SwipeRow).
  const handleDeleteDoneTask = (id: string): boolean => {
    if (!confirm("Delete this completed task? This can't be undone.")) return false;
    setSwipedId(null);
    setBusyId(id);
    startTransition(async () => {
      await deleteTask(id);
      setBusyId(null);
      setDoneList((list) => (list ? list.filter((t) => t.id !== id) : list));
    });
    return true;
  };

  // Puts a completed task back on the open list (swipe/hover on the Done
  // list), with its details, emails and notes untouched.
  const handleReinstateDoneTask = (id: string) => {
    setSwipedId(null);
    setBusyId(id);
    startTransition(async () => {
      await reopenTask(id);
      setBusyId(null);
      setDoneList((list) => (list ? list.filter((t) => t.id !== id) : list));
      router.refresh();
    });
  };

  // Deletes a processed alert's record straight from the list (swipe/
  // hover). Returns false if the confirm was cancelled, so a full swipe
  // puts the row back (see SwipeRow).
  const handleDeleteProcessedAlert = (id: string): boolean => {
    if (!confirm("Delete this record? This can't be undone.")) return false;
    setSwipedId(null);
    setBusyId(id);
    startTransition(async () => {
      await deleteProcessedAlert(id);
      setBusyId(null);
      setProcessedAlerts((list) => (list ? list.filter((a) => a.id !== id) : list));
    });
    return true;
  };

  const handleRecipientPick = (value: string) => {
    const match = composeRecipients.find((r) => r.email === value);
    setComposeTo(value);
    setComposeArtistId(match?.artistId || null);
    setComposeCustomerId(match?.customerId || null);
  };

  const handleSendCompose = () => {
    if (!modeMailbox) return;
    setComposeError(null);
    setComposeSending(true);
    const fd = new FormData();
    fd.set("to", composeTo);
    fd.set("subject", composeSubject);
    fd.set("body", capitaliseParagraphs(composeBody));
    fd.set("mailbox", modeMailbox);
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
    setTaskEmail(t.email ?? "");
    setTaskDirty(false);
    setTaskError(null);
    setTaskPopup(null);
  };

  const startTask = () => {
    setTaskForm(EMPTY_TASK_FORM);
    setTaskEmail("");
    setTaskDirty(false);
    setTaskError(null);
    setTaskPopup(null);
  };

  const handleTaskChange = (patch: Partial<TaskInput>) => {
    setTaskForm((f) => (f ? { ...f, ...patch } : f));
    setTaskDirty(true);
  };

  // Saves (or creates) the open task, and with complete = true completes
  // it too. On failure the reason shows under the form.
  const persistTask = async (complete: boolean): Promise<string | null> => {
    if (!taskForm) return null;
    setTaskError(null);
    const res = await saveTask(
      { ...taskForm, description: capitaliseParagraphs(taskForm.description) },
      complete
    );
    if (!res.ok) {
      setTaskError(res.error);
      return null;
    }
    setTaskDirty(false);
    router.refresh();
    return res.id;
  };

  // Closing a task saves it first if anything changed. If it can't be
  // saved (e.g. no name yet), the reason is shown and closing without
  // saving is offered, so a half-started task never traps the modal.
  const closeTask = () => {
    if (isPending) return;
    if (!taskDirty) {
      closeModal();
      return;
    }
    startTransition(async () => {
      if (await persistTask(false)) {
        closeModal();
        return;
      }
      if (confirm("This task can't be saved yet (see the message under the form). Close without saving?")) {
        closeModal();
      }
    });
  };

  // Email / Activity: a new or changed task is saved first, so the email
  // or note is always linked to a saved task with its latest details.
  const openTaskPopup = (popup: TaskPopup) => {
    if (taskForm?.id && !taskDirty) {
      setTaskPopup(popup);
      return;
    }
    startTransition(async () => {
      const id = await persistTask(false);
      if (!id) return;
      setTaskForm((f) => (f ? { ...f, id } : f));
      setTaskPopup(popup);
    });
  };

  // Completed: saves and completes the task, so it moves from the open
  // list on the left into Done on the right.
  const handleTaskComplete = () => {
    startTransition(async () => {
      if (!(await persistTask(true))) return;
      closeModal();
      refreshRight();
    });
  };

  // The forward has gone — close its window and show it in Sent.
  const handleForwarded = () => {
    setForwarding(null);
    refreshRight();
  };

  // A sale alert opens the sale modal straight away; every other alert
  // goes into the address, so the server can load what its modal needs.
  const openAlert = (a: AlertItem) => {
    if (a.sale) {
      setSaleAlert(a);
      return;
    }
    router.push(currentUrl({ alertId: a.id }));
  };

  // An alert's link normally leaves this screen for the page where it
  // can be dealt with; the exception is a link back to the Inbox itself
  // (a new-email-reply alert, always Art), which switches this screen to
  // Art mode.
  const handleAlertLink = (a: AlertItem) => {
    if (!a.linkHref) return;
    if (a.linkHref.startsWith("/accounts/inbox")) {
      setMode("art");
      setTypeFilter("");
      setSentList(null);
      resetModal();
    }
    router.push(a.linkHref);
  };

  const handleAlertDismiss = (a: AlertItem) => {
    startTransition(async () => {
      await dismissAlert(a.id);
      refreshRight();
      router.push(currentUrl());
    });
  };

  // Deletes an alert straight from the list, without opening it — for the
  // sale alerts, which are only there for information. It's dismissed, so
  // it moves into the processed list.
  const handleAlertDelete = (a: AlertItem) => {
    startTransition(async () => {
      await dismissAlert(a.id);
      await refreshOpenAlerts();
      refreshRight();
      router.refresh();
    });
  };

  // The client was marked up to date — close the modal and show the new
  // entry in the processed list.
  const handleUpToDateDone = () => {
    refreshRight();
    router.push(currentUrl());
  };

  // Something changed the sale in the sale modal (paid, cancelled,
  // deleted, invoice sent) — bring the Alert list and nav badge up to
  // date.
  const handleSaleChanged = () => {
    refreshOpenAlerts().then(() => router.refresh());
  };

  // Each pill's count: unread emails (Art, Business, Personal), open
  // alerts and open tasks. Nothing shows for zero, or while Personal's
  // is unknown.
  const modeCounts: Record<Mode, number | null> = {
    art: unreadCounts.ART,
    business: unreadCounts.BUSINESS,
    personal: personalUnread,
    alert: initialAlerts.length,
    task: initialTasks.length,
  };

  const modeBar = (
    <div className={pillWrapCls}>
      {MODES.map((m) => {
        const count = modeCounts[m.mode];
        return (
          <button
            key={m.mode}
            type="button"
            onClick={() => switchMode(m.mode)}
            className={`${pillCls(mode === m.mode)} inline-flex items-center gap-1.5`}
          >
            {m.label}
            {!!count && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-neutral-400 px-1 text-[10px] leading-none text-neutral-600">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  // The heading row above each column — the same height on both sides,
  // so the two lists line up.
  const headRowCls = "mb-3 flex h-9 items-center gap-3";
  const filterCls = "min-w-0 max-w-[14rem] flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm";

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-6 py-6">
      {/* ---- The mode pills, in a band across the top ---- */}
      <div className="mb-4 flex justify-center overflow-x-auto rounded-xl bg-[#E8F1F0] px-4 py-3">{modeBar}</div>

      {mode === "personal" ? (
        <PersonalMailPanel gmail={gmail} error={gmailError} onChanged={refreshPersonalUnread} />
      ) : (
      <div className="flex min-h-0 flex-1 gap-6">
      {/* ---- LEFT: what needs attention ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className={headRowCls}>
          <h1 className="text-xl font-semibold text-neutral-900">Inbox</h1>
          {isMailMode ? (
            <select
              value={showArchived ? "archived" : "inbox"}
              onChange={(e) => handleArchivedViewChange(e.target.value)}
              className={filterCls}
            >
              <option value="inbox">Inbox</option>
              <option value="archived">Archived</option>
            </select>
          ) : (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={filterCls}
            >
              <option value="">All types</option>
              {typeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {mode !== "alert" && (
            <button
              type="button"
              onClick={isMailMode ? startCompose : startTask}
              className="ml-auto shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
            >
              {isMailMode ? "New message" : "New Task"}
            </button>
          )}
        </div>

        <div className={`${cardCls} flex-1 overflow-y-auto`}>
          {isMailMode ? (
            listLoading ? (
              <p className="p-4 text-center text-sm text-neutral-400">Loading…</p>
            ) : initialList.length === 0 ? (
              <p className="p-4 text-center text-sm text-neutral-400">
                {showArchived ? "Nothing archived." : "Nothing here yet."}
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {initialList.map((m) => (
                  <li key={m.id}>
                    <SwipeRow
                      open={swipedId === m.id}
                      onOpenChange={(open) => setSwipedId(open ? m.id : null)}
                      busy={isPending && rowBusyId === m.id}
                      actions={[
                        {
                          label: m.taskId ? "Open task" : "Make task",
                          icon: <TaskIcon />,
                          onClick: () => handleMakeTask(m.id),
                        },
                        showArchived
                          ? {
                              label: "Move to Inbox",
                              icon: <UnarchiveIcon />,
                              primary: true,
                              onClick: () => runRowAction(m.id, unarchiveInboundEmail),
                            }
                          : {
                              label: "Archive",
                              icon: <ArchiveIcon />,
                              primary: true,
                              onClick: () => runRowAction(m.id, archiveInboundEmail),
                            },
                        { label: "Delete", icon: <TrashIcon />, danger: true, onClick: () => handleDeleteRow(m.id) },
                      ]}
                    >
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
                          {m.taskId && (
                            <span className="mr-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                              Task
                            </span>
                          )}
                          {capitaliseParagraphs(m.subject) || "(no subject)"}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-neutral-400">
                          {m.artistName ? `${m.artistName}${m.customerName ? ` — ${m.customerName}` : ""}` : "General"}
                        </p>
                      </button>
                    </SwipeRow>
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
              <>
                {todayTasks.length > 0 && (
                  <ul className="divide-y divide-[#EEDCBA] overflow-hidden rounded-lg bg-[#F8E8CA] shadow-sm">
                    {todayTasks.map((t) => renderOpenTask(t, true))}
                  </ul>
                )}
                {otherTasks.length > 0 && (
                  <ul className="divide-y divide-neutral-100">{otherTasks.map((t) => renderOpenTask(t, false))}</ul>
                )}
              </>
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
                  {isInformationalSaleAlert(a) && (
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

      {/* ---- RIGHT: Processed (Sent, Done or processed alerts) ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className={headRowCls}>
          <h2 className="text-xl font-semibold text-neutral-900">Processed</h2>
        </div>

        <div className={`${cardCls} flex-1 overflow-y-auto`}>
          {isMailMode ? (
            !sentList ? (
              <p className="p-4 text-center text-sm text-neutral-400">Loading…</p>
            ) : sentList.length === 0 ? (
              <p className="p-4 text-center text-sm text-neutral-400">Nothing sent yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {sentList.map((m) => (
                  <li key={m.id}>
                    <SwipeRow
                      open={swipedId === m.id}
                      onOpenChange={(open) => setSwipedId(open ? m.id : null)}
                      busy={busyId === m.id}
                      actions={[
                        { label: "Delete", icon: <TrashIcon />, danger: true, onClick: () => handleDeleteSentItem(m.id) },
                      ]}
                    >
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
                    </SwipeRow>
                  </li>
                ))}
              </ul>
            )
          ) : mode === "task" ? (
            !doneList ? (
              <p className="p-4 text-center text-sm text-neutral-400">Loading…</p>
            ) : doneList.length === 0 ? (
              <p className="p-4 text-center text-sm text-neutral-400">Nothing completed yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {doneList.map((t) => (
                  <li key={t.id}>
                    <SwipeRow
                      open={swipedId === t.id}
                      onOpenChange={(open) => setSwipedId(open ? t.id : null)}
                      busy={busyId === t.id}
                      actions={[
                        {
                          label: "Reinstate",
                          icon: <ReinstateIcon />,
                          primary: true,
                          onClick: () => handleReinstateDoneTask(t.id),
                        },
                        { label: "Delete", icon: <TrashIcon />, danger: true, onClick: () => handleDeleteDoneTask(t.id) },
                      ]}
                    >
                      <div className="px-3 py-2.5">
                        <p className="truncate text-sm font-semibold text-neutral-900">
                          {capitaliseParagraphs(t.name)}
                        </p>
                        <p className="truncate text-xs text-neutral-500">{t.category || "No category"}</p>
                        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-neutral-400">
                          <span>Date completed</span>
                          <span className="text-[10px]">{t.completedAt ? formatDate(t.completedAt) : ""}</span>
                        </div>
                      </div>
                    </SwipeRow>
                  </li>
                ))}
              </ul>
            )
          ) : !processedAlerts ? (
            <p className="p-4 text-center text-sm text-neutral-400">Loading…</p>
          ) : processedAlerts.length === 0 ? (
            <p className="p-4 text-center text-sm text-neutral-400">Nothing dealt with yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {processedAlerts.map((a) => (
                <li key={a.id}>
                  <SwipeRow
                    open={swipedId === a.id}
                    onOpenChange={(open) => setSwipedId(open ? a.id : null)}
                    busy={busyId === a.id}
                    actions={[
                      { label: "Delete", icon: <TrashIcon />, danger: true, onClick: () => handleDeleteProcessedAlert(a.id) },
                    ]}
                  >
                    <div className="px-3 py-2.5">
                      <div className={itemHeadCls}>
                        <span className="truncate text-sm font-semibold text-neutral-900">
                          {ALERT_TYPE_LABELS[a.type] || a.type}
                        </span>
                        <span className="shrink-0 text-[10px] text-neutral-400">{formatDate(a.resolvedAt)}</span>
                      </div>
                      <p className="truncate text-xs text-neutral-500">{a.artistName || "General"}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-neutral-400">{capitaliseParagraphs(a.message)}</p>
                    </div>
                  </SwipeRow>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      </div>
      )}

      {/* ---- SALE MODAL: an overdue-invoice alert (same as Consolidated Sales) ---- */}
      {saleAlert?.sale && (
        <SaleModal
          key={saleAlert.sale.purchaseId}
          target={saleAlert.sale}
          onClose={() => setSaleAlert(null)}
          onChanged={handleSaleChanged}
        />
      )}

      {/* ---- FORWARD: over an opened message or sent item ---- */}
      {forwarding && (
        <ForwardEmailPopup
          key={`${forwarding.source.kind}-${forwarding.source.id}`}
          onForward={(to, note) => {
            const fd = new FormData();
            fd.set("to", to);
            fd.set("note", note);
            return forwardEmail(forwarding.source, fd);
          }}
          subject={forwarding.subject}
          attachmentCount={forwarding.attachmentCount}
          fromAddress={modeMailbox ? mailboxAddresses[modeMailbox] : ""}
          composeRecipients={composeRecipients}
          onSent={handleForwarded}
          onClose={() => setForwarding(null)}
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
                onClick={mode === "task" ? closeTask : closeModal}
                disabled={mode === "task" && isPending}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <div className={`flex-1 overflow-y-auto px-5 pb-5 ${threadOpen ? "" : "pt-5"}`}>
              {mode === "alert" ? (
                clientPanel ? (
                  <AlertClientPanel
                    key={clientPanel.data.artist.id}
                    alertType={clientPanel.alertType}
                    data={clientPanel.data}
                    onDone={handleUpToDateDone}
                  />
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
                    saving={isPending}
                    error={taskError}
                    activity={
                      taskForm.id && (
                        <TaskActivityPanel
                          key={taskForm.id}
                          taskId={taskForm.id}
                          defaultTo={taskEmail}
                          composeRecipients={composeRecipients}
                          mailboxAddresses={mailboxAddresses}
                          popup={taskPopup}
                          onPopupClose={() => setTaskPopup(null)}
                          onEmailSent={setTaskEmail}
                        />
                      )
                    }
                    onChange={handleTaskChange}
                    onEmail={() => openTaskPopup("email")}
                    onActivity={() => openTaskPopup("note")}
                    onComplete={handleTaskComplete}
                  />
                )
              ) : composing ? (
                <div className="mx-auto max-w-xl space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    New message — from {modeMailbox ? mailboxAddresses[modeMailbox] : ""}
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
                <div className="mx-auto max-w-xl space-y-3">
                  <div className={`${emailHeadCls} rounded-md border border-neutral-200`}>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <span className="inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                        {KIND_LABELS[selectedSent.kind] || selectedSent.kind}
                      </span>
                      <p className="text-sm font-medium text-neutral-800 [overflow-wrap:anywhere]">
                        {translation.shown(selectedSent.id)?.subject ?? (selectedSent.subject || "(no subject)")}
                      </p>
                      <p className="truncate text-xs text-neutral-400">
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
                    </div>
                    <MiniActionBar>
                      <MiniActionButton
                        onClick={() => handleDeleteSentItem(selectedSent.id)}
                        disabled={busyId === selectedSent.id || isPending}
                      >
                        {busyId === selectedSent.id ? "Deleting…" : "Delete"}
                      </MiniActionButton>
                      <MiniActionButton
                        onClick={() =>
                          setForwarding({
                            source: { kind: "OUT", id: selectedSent.id },
                            subject: selectedSent.subject,
                            attachmentCount: 0,
                          })
                        }
                      >
                        Forward
                      </MiniActionButton>
                      <MiniActionButton
                        onClick={() =>
                          translation.toggle(selectedSent.id, selectedSent.subject || "", selectedSent.body || "")
                        }
                        disabled={translation.busy(selectedSent.id)}
                      >
                        {translation.label(selectedSent.id)}
                      </MiniActionButton>
                    </MiniActionBar>
                  </div>
                  {translation.error(selectedSent.id) && (
                    <p className="text-sm text-red-600">{translation.error(selectedSent.id)}</p>
                  )}
                  <div className="whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
                    {translation.shown(selectedSent.id)?.body ?? (selectedSent.body || "(empty)")}
                  </div>
                </div>
              ) : threadError ? (
                <p className="pt-5 text-sm text-red-600">This message couldn&apos;t be opened. Please try again.</p>
              ) : threadLoading || !thread ? (
                <p className="pt-5 text-sm text-neutral-400">Loading…</p>
              ) : (
                <div className="mx-auto max-w-xl space-y-4 pt-5">
                  {thread.map((item) => (
                    // Each message's header (sender, date, addresses,
                    // subject, and its mini action bar) stays pinned at the
                    // top while its body scrolls, on a tinted background to
                    // set it apart from the body (2026-09-24).
                    <div key={item.id} className="rounded-md border border-neutral-200 bg-white">
                      <div className={`${emailHeadCls} sticky top-0 z-10 rounded-t-md border-b border-neutral-200`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3 text-xs text-neutral-500">
                            <span className="min-w-0 truncate font-medium text-neutral-700">
                              {item.direction === "OUT" ? "You" : item.fromName || item.fromAddress}
                            </span>
                            <span className="shrink-0">{formatDateTime(item.at)}</span>
                          </div>
                          {item.direction === "IN" && (
                            <p className="mt-0.5 truncate text-xs text-neutral-400">
                              {item.fromAddress} → {item.toAddress}
                            </p>
                          )}
                          <p className="mt-0.5 text-sm font-medium text-neutral-800 [overflow-wrap:anywhere]">
                            {translation.shown(item.id)?.subject ?? item.subject}
                          </p>
                        </div>
                        <MiniActionBar>
                          {item.htmlBody && (
                            <MiniActionButton onClick={() => setTextShownId(textShownId === item.id ? null : item.id)}>
                              {textShownId === item.id ? "Show HTML" : "Show text"}
                            </MiniActionButton>
                          )}
                          <MiniActionButton
                            onClick={() => handleDeleteThreadItem(item)}
                            disabled={busyId === item.id || isPending}
                          >
                            {busyId === item.id ? "Deleting…" : "Delete"}
                          </MiniActionButton>
                          <MiniActionButton
                            onClick={() =>
                              setForwarding({
                                source: { kind: item.direction, id: item.id },
                                subject: item.subject,
                                attachmentCount: item.attachments.filter((a) => a.saved).length,
                              })
                            }
                          >
                            Forward
                          </MiniActionButton>
                          <MiniActionButton
                            onClick={() => translation.toggle(item.id, item.subject || "", item.textBody)}
                            disabled={translation.busy(item.id)}
                          >
                            {translation.label(item.id)}
                          </MiniActionButton>
                          {item.direction === "IN" && (
                            <MiniActionButton onClick={() => handleMakeTask(item.id)} disabled={isPending}>
                              {openListItem?.taskId ? "Open task" : "Make task"}
                            </MiniActionButton>
                          )}
                        </MiniActionBar>
                      </div>

                      <div className="p-3">
                        {translation.error(item.id) && (
                          <p className="mb-2 text-sm text-red-600">{translation.error(item.id)}</p>
                        )}
                        <EmailBody
                          htmlBody={item.htmlBody}
                          textBody={translation.shown(item.id)?.body ?? item.textBody}
                          showText={textShownId === item.id || !!translation.shown(item.id)}
                        />
                        {item.attachments.length > 0 && (
                          <ul className="mt-3 space-y-1 border-t border-neutral-200 pt-2">
                            {item.attachments.map((a) => (
                              <li key={a.id} className="text-sm [overflow-wrap:anywhere]">
                                {a.saved ? (
                                  <a
                                    href={`/api/inbound-attachment/${a.id}`}
                                    className="text-neutral-800 underline hover:text-neutral-600"
                                  >
                                    {a.filename}
                                  </a>
                                ) : (
                                  <span className="text-neutral-500">{a.filename}</span>
                                )}{" "}
                                <span className="text-xs text-neutral-400">
                                  ({formatFileSize(a.size)}
                                  {!a.saved && (a.tooLarge ? " — too large to save" : " — couldn't be saved")})
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
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
