"use client";

import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  archivePersonal,
  deletePersonal,
  disconnectGmail,
  forwardPersonal,
  getPersonalMail,
  getPersonalSendingAddress,
  getPersonalThread,
  replyPersonal,
} from "@/lib/actions/gmail";
import type { PersonalBox, PersonalMailItem, PersonalMailMessage } from "@/lib/gmailMessages";
import { personalAttachmentUrl } from "@/lib/gmailAttachmentUrl";
import EmailBody, { formatFileSize } from "@/components/EmailBody";
import { MiniActionBar, MiniActionButton } from "@/components/ActionPanel";
import ForwardEmailPopup from "@/components/ForwardEmailPopup";
import { useEmailTranslation } from "@/components/useEmailTranslation";
import SwipeRow from "@/components/SwipeRow";
import { TrashIcon } from "@/components/ActionIcons";
import { formatDate, formatDateTime } from "@/lib/formatDate";
import { capitaliseParagraphs } from "@/lib/text";

// The Inbox's Personal tab (2026-10-09): Craig's own Gmail, read live
// from Google (see lib/gmailMessages.ts). Laid out like the other tabs —
// the inbox on the left, Sent on the right, each its latest 50 emails
// only (older mail is looked up in Gmail itself), and a conversation
// opens in the same kind of window (marking it read in Gmail). Each email
// there has Reply (the reply box opens at the top of the window) and
// Forward, sent through Gmail from its own sending address
// (craig@isendyouthis.com) so they show in Gmail's Sent too, Archive
// (the whole conversation out of the inbox, as in Gmail), and Delete;
// a whole conversation can be deleted from the list (swipe, or the hover
// icon), as on the other tabs. Delete is Gmail's own — to its Bin, where
// it can be recovered for 30 days. Until
// Gmail is connected, it shows Connect Gmail instead (see
// /api/gmail/connect).

const cardCls = "rounded-lg border border-neutral-200 bg-white";
const pillWrapCls = "inline-flex w-fit rounded-full border border-neutral-300 bg-white p-1";
const pillActiveCls = "rounded-full bg-neutral-200 px-3 py-1 text-xs font-medium text-neutral-900";
const itemHeadCls = "flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2";
const emailHeadCls = "flex flex-col gap-2 bg-neutral-50 px-3 py-2 sm:flex-row sm:items-stretch";
const linkBtnCls = "text-xs text-neutral-500 underline hover:text-neutral-800 disabled:opacity-50";

type ListState = {
  items: PersonalMailItem[];
  loading: boolean;
  error: string | null;
};

// One of the two lists, fetched from Gmail again only when its
// refreshKey changes. Each fetch costs Gmail about 50 requests and Gmail
// limits requests per minute (2026-10-10 — reloading both lists on every
// close ran into that limit), so anything the screen already knows the
// outcome of (read, deleted, archived) is changed here with `update`
// instead of fetched again.
function useMailList(
  box: PersonalBox,
  refreshKey: number,
  onReconnect: () => void
): { state: ListState; update: (change: (items: PersonalMailItem[]) => PersonalMailItem[]) => void } {
  const [state, setState] = useState<ListState>({ items: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    getPersonalMail(box)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          if (res.reconnect) onReconnect();
          setState((s) => ({ ...s, loading: false, error: res.error }));
          return;
        }
        setState({ items: res.data, loading: false, error: null });
      })
      // The server itself didn't answer (too slow, or offline).
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: "Gmail took too long to answer. Press Refresh." }));
      });
    return () => {
      cancelled = true;
    };
  }, [box, refreshKey, onReconnect]);

  const update = useCallback(
    (change: (items: PersonalMailItem[]) => PersonalMailItem[]) =>
      setState((s) => ({ ...s, items: change(s.items) })),
    []
  );
  return { state, update };
}

function MailList({
  state,
  emptyText,
  openId,
  onOpen,
  swipedId,
  onSwipe,
  busyId,
  onDelete,
}: {
  state: ListState;
  emptyText: string;
  openId: string | null;
  onOpen: (item: PersonalMailItem) => void;
  swipedId: string | null;
  onSwipe: (threadId: string | null) => void;
  busyId: string | null;
  onDelete: (item: PersonalMailItem) => boolean;
}) {
  if (state.error && state.items.length === 0) {
    return <p className="p-4 text-center text-sm text-red-600">{state.error}</p>;
  }
  if (state.loading && state.items.length === 0) {
    return <p className="p-4 text-center text-sm text-neutral-400">Loading…</p>;
  }
  if (state.items.length === 0) {
    return <p className="p-4 text-center text-sm text-neutral-400">{emptyText}</p>;
  }
  return (
    <>
      <ul className="divide-y divide-neutral-100">
        {state.items.map((m) => (
          <li key={m.threadId}>
            <SwipeRow
              open={swipedId === m.threadId}
              onOpenChange={(isOpen) => onSwipe(isOpen ? m.threadId : null)}
              busy={busyId === m.threadId}
              actions={[{ label: "Delete", icon: <TrashIcon />, danger: true, onClick: () => onDelete(m) }]}
            >
              <button
                type="button"
                onClick={() => onOpen(m)}
                className={`block w-full px-3 py-2.5 text-left hover:bg-neutral-50 ${
                  openId === m.threadId ? "bg-neutral-100" : ""
                }`}
              >
                <div className={itemHeadCls}>
                  <span className={`truncate text-sm ${m.unread ? "font-semibold text-neutral-900" : "text-neutral-600"}`}>
                    {m.name || m.address}
                    {m.count > 1 && <span className="ml-1 text-xs font-normal text-neutral-400">{m.count}</span>}
                  </span>
                  <span className="shrink-0 text-[10px] text-neutral-400">{formatDate(m.at)}</span>
                </div>
                <p className={`truncate text-xs ${m.unread ? "text-neutral-800" : "text-neutral-500"}`}>
                  {m.subject || "(no subject)"}
                </p>
                <p className="mt-0.5 truncate text-xs text-neutral-400">{m.snippet}</p>
              </button>
            </SwipeRow>
          </li>
        ))}
      </ul>
      {state.error && <p className="px-3 pb-2 text-center text-xs text-red-600">{state.error}</p>}
    </>
  );
}

export default function PersonalMailPanel({
  modeBar,
  gmail,
  error,
}: {
  modeBar: ReactNode;
  gmail: { email: string } | null;
  error: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [inboxKey, setInboxKey] = useState(0);
  const [sentKey, setSentKey] = useState(0);
  const refreshInbox = () => setInboxKey((k) => k + 1);
  const refreshSent = () => setSentKey((k) => k + 1);
  // Gmail turned out not to be connected any more (access withdrawn) —
  // the server is asked again, which then shows Connect Gmail.
  const handleReconnect = useCallback(() => router.refresh(), [router]);

  const inbox = useMailList("INBOX", inboxKey, handleReconnect);
  const sent = useMailList("SENT", sentKey, handleReconnect);
  // Changes a conversation's row in both lists, or removes it (null).
  const updateBoth = (threadId: string, change: (item: PersonalMailItem) => PersonalMailItem | null) => {
    const apply = (items: PersonalMailItem[]) =>
      items.flatMap((i) => {
        if (i.threadId !== threadId) return [i];
        const next = change(i);
        return next ? [next] : [];
      });
    inbox.update(apply);
    sent.update(apply);
  };

  const [open, setOpen] = useState<PersonalMailItem | null>(null);
  const [thread, setThread] = useState<PersonalMailMessage[] | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [textShownId, setTextShownId] = useState<string | null>(null);
  // Translate / Show original on an opened email (2026-10-09).
  const translation = useEmailTranslation();
  // The email being replied to — the reply box shows at the top while set.
  const [replyTo, setReplyTo] = useState<PersonalMailMessage | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [forwarding, setForwarding] = useState<PersonalMailMessage | null>(null);
  // The list row that's swiped open, and the conversation or email being
  // deleted.
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // The address replies and forwards go out from, shown so there are no
  // surprises.
  const [sendingAddress, setSendingAddress] = useState<string | null>(null);
  useEffect(() => {
    getPersonalSendingAddress()
      .then(setSendingAddress)
      .catch(() => setSendingAddress(null));
  }, []);

  const loadThread = (threadId: string) =>
    getPersonalThread(threadId)
      .then((res) => {
        if (!res.ok) {
          if (res.reconnect) handleReconnect();
          setThreadError(res.error);
          return;
        }
        setThread(res.data);
      })
      .catch(() => setThreadError("Gmail took too long to answer. Please try again."));

  const openThread = (item: PersonalMailItem) => {
    setOpen(item);
    setThread(null);
    setThreadError(null);
    setTextShownId(null);
    translation.reset();
    setReplyTo(null);
    setReplyBody("");
    setReplyError(null);
    loadThread(item.threadId);
  };

  const startReply = (m: PersonalMailMessage) => {
    if (replyTo && replyTo.id !== m.id && replyBody.trim() && !confirm("Discard the reply you've started?")) return;
    if (replyTo?.id !== m.id) setReplyBody("");
    setReplyTo(m);
    setReplyError(null);
  };

  const cancelReply = () => {
    if (replyBody.trim() && !confirm("Discard your reply?")) return;
    setReplyTo(null);
    setReplyBody("");
    setReplyError(null);
  };

  // Closing checks first if a reply has been typed but not sent.
  const closeThread = () => {
    if (isPending) return;
    if (replyBody.trim() && !confirm("Close without sending your reply?")) return;
    // Opening a conversation marks it read in Gmail — shown in the lists.
    if (open?.unread) updateBoth(open.threadId, (i) => ({ ...i, unread: false }));
    setOpen(null);
    setThread(null);
  };

  const handleSendReply = () => {
    if (!open || !replyTo) return;
    setReplyError(null);
    startTransition(async () => {
      const res = await replyPersonal(replyTo.id, capitaliseParagraphs(replyBody));
      if (!res.ok) {
        setReplyError(res.error);
        return;
      }
      setReplyTo(null);
      setReplyBody("");
      refreshSent();
      await loadThread(open.threadId); // The reply shows in the conversation.
    });
  };

  // Deletes a whole conversation from the list. Returns false if the
  // confirm was cancelled, so a full swipe puts the row back.
  const handleDeleteConversation = (item: PersonalMailItem): boolean => {
    if (!confirm("Delete this conversation? It goes to Gmail's Bin, where it can be recovered for 30 days.")) {
      return false;
    }
    setSwipedId(null);
    setBusyId(item.threadId);
    startTransition(async () => {
      const res = await deletePersonal({ threadId: item.threadId });
      setBusyId(null);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      if (open?.threadId === item.threadId) setOpen(null);
      updateBoth(item.threadId, () => null);
    });
    return true;
  };

  // Archives the open conversation and closes it.
  const handleArchive = () => {
    if (!open) return;
    if (replyBody.trim() && !confirm("Archive without sending your reply?")) return;
    const threadId = open.threadId;
    setBusyId(threadId);
    startTransition(async () => {
      const res = await archivePersonal(threadId);
      setBusyId(null);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      setOpen(null);
      setThread(null);
      inbox.update((items) => items.filter((i) => i.threadId !== threadId));
    });
  };

  // Deletes one email of the open conversation — closing it if that was
  // its only email.
  const handleDeleteEmail = (m: PersonalMailMessage) => {
    if (!open || !thread) return;
    if (!confirm("Delete this email? It goes to Gmail's Bin, where it can be recovered for 30 days.")) return;
    setBusyId(m.id);
    startTransition(async () => {
      const res = await deletePersonal({ messageId: m.id });
      setBusyId(null);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      if (replyTo?.id === m.id) setReplyTo(null);
      if (thread.length <= 1) {
        updateBoth(open.threadId, () => null);
        setOpen(null);
        setThread(null);
      } else {
        // Only the list the email was shown in changes.
        if (m.sentByMe) refreshSent();
        else refreshInbox();
        await loadThread(open.threadId);
      }
    });
  };

  const handleDisconnect = () => {
    if (!confirm("Disconnect Gmail? Your emails stay in Gmail; they just stop showing here until you connect again.")) {
      return;
    }
    startTransition(async () => {
      await disconnectGmail();
      router.refresh();
    });
  };

  const heading = (
    <>
      <div className="mb-3 flex h-[30px] items-center">
        <h1 className="text-xl font-semibold text-neutral-900">Inbox</h1>
      </div>
      <div className="mb-3">{modeBar}</div>
    </>
  );

  if (!gmail) {
    return (
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-6 py-6">
        {heading}
        <div className={`${cardCls} p-5`}>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-neutral-600">Show your Gmail here, and reply from it.</p>
            {/* A plain link, not router navigation — it leaves the app for Google. */}
            <a
              href="/api/gmail/connect"
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
            >
              Connect Gmail
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl gap-6 px-6 py-6">
      {/* ---- LEFT: the inbox ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {heading}
        <div className="mb-3 flex h-[34px] items-center justify-between gap-2 text-xs text-neutral-500">
          <span className="truncate">{gmail.email}</span>
          <span className="flex shrink-0 gap-3">
            <button
              type="button"
              onClick={() => {
                refreshInbox();
                refreshSent();
              }}
              className={linkBtnCls}
            >
              Refresh
            </button>
            <button type="button" onClick={handleDisconnect} disabled={isPending} className={linkBtnCls}>
              Disconnect
            </button>
          </span>
        </div>
        <div className={`${cardCls} flex-1 overflow-y-auto`}>
          <MailList
            state={inbox.state}
            emptyText="Nothing in your inbox."
            openId={open?.threadId ?? null}
            onOpen={openThread}
            swipedId={swipedId}
            onSwipe={setSwipedId}
            busyId={busyId}
            onDelete={handleDeleteConversation}
          />
        </div>
      </div>

      {/* ---- RIGHT: Sent ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex h-[30px] items-center">
          <h2 className="text-xl font-semibold text-neutral-900">Processed</h2>
        </div>
        <div className={`mb-3 ${pillWrapCls}`}>
          <span className={pillActiveCls}>Sent</span>
        </div>
        <div className="mb-3 h-[34px]" />
        <div className={`${cardCls} flex-1 overflow-y-auto`}>
          <MailList
            state={sent.state}
            emptyText="Nothing sent yet."
            openId={open?.threadId ?? null}
            onOpen={openThread}
            swipedId={swipedId}
            onSwipe={setSwipedId}
            busyId={busyId}
            onDelete={handleDeleteConversation}
          />
        </div>
      </div>

      {/* ---- A conversation ---- */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeThread}>
          <div
            className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 justify-end border-b border-neutral-100 px-4 py-2">
              <button
                type="button"
                onClick={closeThread}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5">
              {threadError ? (
                <p className="pt-5 text-sm text-red-600">{threadError}</p>
              ) : !thread ? (
                <p className="pt-5 text-sm text-neutral-400">Loading…</p>
              ) : (
                <div className="mx-auto max-w-xl space-y-4 pt-5">
                  {/* Pinned at the top while open, so the emails scroll
                      underneath it and can be read while replying. */}
                  {replyTo && (
                    <div className="sticky top-0 z-20 rounded-md border border-neutral-300 bg-neutral-50 p-3 shadow-md">
                      <label className="mb-1 block text-xs text-neutral-500">
                        Reply to {replyTo.sentByMe ? replyTo.to : replyTo.fromName || replyTo.fromAddress}
                        {sendingAddress && ` — from ${sendingAddress}`}
                      </label>
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        rows={6}
                        autoFocus
                        className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm"
                      />
                      {replyError && <p className="mt-1 text-sm text-red-600">{replyError}</p>}
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelReply}
                          disabled={isPending}
                          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSendReply}
                          disabled={isPending || !replyBody.trim()}
                          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                        >
                          {isPending ? "Sending…" : "Send reply"}
                        </button>
                      </div>
                    </div>
                  )}
                  {thread.map((m) => (
                    <div key={m.id} className="rounded-md border border-neutral-200 bg-white">
                      {/* Each email's header stays in view while its body
                          scrolls — except while replying, when the reply
                          box holds the top. */}
                      <div
                        className={`${emailHeadCls} ${replyTo ? "" : "sticky top-0 z-10"} rounded-t-md border-b border-neutral-200`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3 text-xs text-neutral-500">
                            <span className="min-w-0 truncate font-medium text-neutral-700">
                              {m.sentByMe ? "You" : m.fromName || m.fromAddress}
                            </span>
                            <span className="shrink-0">{formatDateTime(m.at)}</span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-neutral-400">
                            {m.fromAddress} → {m.to}
                            {m.cc && `, cc ${m.cc}`}
                          </p>
                          <p className="mt-0.5 text-sm font-medium text-neutral-800 [overflow-wrap:anywhere]">
                            {translation.shown(m.id)?.subject ?? m.subject}
                          </p>
                        </div>
                        <MiniActionBar>
                          {m.htmlBody && (
                            <MiniActionButton onClick={() => setTextShownId(textShownId === m.id ? null : m.id)}>
                              {textShownId === m.id ? "Show HTML" : "Show text"}
                            </MiniActionButton>
                          )}
                          <MiniActionButton onClick={() => startReply(m)}>Reply</MiniActionButton>
                          <MiniActionButton onClick={() => setForwarding(m)}>Forward</MiniActionButton>
                          <MiniActionButton
                            onClick={() => translation.toggle(m.id, m.subject, m.textBody)}
                            disabled={translation.busy(m.id)}
                          >
                            {translation.label(m.id)}
                          </MiniActionButton>
                          <MiniActionButton onClick={handleArchive} disabled={busyId === open.threadId || isPending}>
                            {busyId === open.threadId ? "Archiving…" : "Archive"}
                          </MiniActionButton>
                          <MiniActionButton onClick={() => handleDeleteEmail(m)} disabled={busyId === m.id || isPending}>
                            {busyId === m.id ? "Deleting…" : "Delete"}
                          </MiniActionButton>
                        </MiniActionBar>
                      </div>
                      <div className="p-3">
                        {translation.error(m.id) && <p className="mb-2 text-sm text-red-600">{translation.error(m.id)}</p>}
                        <EmailBody
                          htmlBody={m.htmlBody}
                          textBody={translation.shown(m.id)?.body ?? m.textBody}
                          showText={textShownId === m.id || !!translation.shown(m.id)}
                        />
                        {m.attachments.length > 0 && (
                          <ul className="mt-3 space-y-1 border-t border-neutral-200 pt-2">
                            {m.attachments.map((a) => (
                              <li key={a.attachmentId} className="text-sm [overflow-wrap:anywhere]">
                                <a
                                  href={personalAttachmentUrl(a)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-neutral-800 underline hover:text-neutral-600"
                                >
                                  {a.filename}
                                </a>{" "}
                                <span className="text-xs text-neutral-400">({formatFileSize(a.size)})</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}

                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- Forward, over the open conversation ---- */}
      {forwarding && (
        <ForwardEmailPopup
          key={forwarding.id}
          onForward={(to, note) => forwardPersonal(forwarding.id, to, note)}
          subject={forwarding.subject}
          attachmentCount={forwarding.attachments.length}
          fromAddress={sendingAddress ?? ""}
          composeRecipients={[]}
          onSent={() => {
            setForwarding(null);
            refreshSent();
          }}
          onClose={() => setForwarding(null)}
        />
      )}
    </div>
  );
}
