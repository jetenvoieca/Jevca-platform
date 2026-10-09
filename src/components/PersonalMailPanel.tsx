"use client";

import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { disconnectGmail, getPersonalMail, getPersonalThread } from "@/lib/actions/gmail";
import type { PersonalBox, PersonalMailItem, PersonalMailMessage } from "@/lib/gmailMessages";
import { personalAttachmentUrl } from "@/lib/gmailAttachmentUrl";
import EmailBody, { formatFileSize } from "@/components/EmailBody";
import { MiniActionBar, MiniActionButton } from "@/components/ActionPanel";
import { formatDate, formatDateTime } from "@/lib/formatDate";

// The Inbox's Personal tab (2026-10-09): Craig's own Gmail, read live
// from Google (see lib/gmailMessages.ts). Laid out like the other tabs —
// the inbox on the left, Sent on the right, each its latest 50 emails
// only (older mail is looked up in Gmail itself), and a conversation
// opens in the same kind of window (marking it read in Gmail). Until
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

// One of the two lists, fetched again whenever refreshKey changes.
function useMailList(box: PersonalBox, refreshKey: number, onReconnect: () => void): ListState {
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

  return state;
}

function MailList({
  state,
  emptyText,
  openId,
  onOpen,
}: {
  state: ListState;
  emptyText: string;
  openId: string | null;
  onOpen: (item: PersonalMailItem) => void;
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
  const [refreshKey, setRefreshKey] = useState(0);
  // Gmail turned out not to be connected any more (access withdrawn) —
  // the server is asked again, which then shows Connect Gmail.
  const handleReconnect = useCallback(() => router.refresh(), [router]);

  const inbox = useMailList("INBOX", refreshKey, handleReconnect);
  const sent = useMailList("SENT", refreshKey, handleReconnect);

  const [open, setOpen] = useState<PersonalMailItem | null>(null);
  const [thread, setThread] = useState<PersonalMailMessage[] | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [textShownId, setTextShownId] = useState<string | null>(null);

  const openThread = (item: PersonalMailItem) => {
    setOpen(item);
    setThread(null);
    setThreadError(null);
    setTextShownId(null);
    getPersonalThread(item.threadId)
      .then((res) => {
        if (!res.ok) {
          if (res.reconnect) handleReconnect();
          setThreadError(res.error);
          return;
        }
        setThread(res.data);
      })
      .catch(() => setThreadError("Gmail took too long to answer. Please try again."));
  };

  const closeThread = () => {
    // Opening a conversation marks it read in Gmail, so the lists catch up.
    if (open?.unread) setRefreshKey((k) => k + 1);
    setOpen(null);
    setThread(null);
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
            <button type="button" onClick={() => setRefreshKey((k) => k + 1)} className={linkBtnCls}>
              Refresh
            </button>
            <button type="button" onClick={handleDisconnect} disabled={isPending} className={linkBtnCls}>
              Disconnect
            </button>
          </span>
        </div>
        <div className={`${cardCls} flex-1 overflow-y-auto`}>
          <MailList
            state={inbox}
            emptyText="Nothing in your inbox."
            openId={open?.threadId ?? null}
            onOpen={openThread}
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
            state={sent}
            emptyText="Nothing sent yet."
            openId={open?.threadId ?? null}
            onOpen={openThread}
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
                  {thread.map((m) => (
                    <div key={m.id} className="rounded-md border border-neutral-200 bg-white">
                      <div className={`${emailHeadCls} sticky top-0 z-10 rounded-t-md border-b border-neutral-200`}>
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
                            {m.subject}
                          </p>
                        </div>
                        {m.htmlBody && (
                          <MiniActionBar>
                            <MiniActionButton onClick={() => setTextShownId(textShownId === m.id ? null : m.id)}>
                              {textShownId === m.id ? "Show HTML" : "Show text"}
                            </MiniActionButton>
                          </MiniActionBar>
                        )}
                      </div>
                      <div className="p-3">
                        <EmailBody htmlBody={m.htmlBody} textBody={m.textBody} showText={textShownId === m.id} />
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
    </div>
  );
}
