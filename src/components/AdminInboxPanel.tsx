"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getThread,
  sendInboxReply,
  type InboxSummaryItem,
  type InboxThreadItem,
} from "@/lib/actions/inboundEmail";
import { sendAdminEmail, type ComposeRecipient } from "@/lib/actions/adminEmail";

// The unified admin inbox (2026-09-05, Email Integration) — "one box
// with a filter" (direct decision): every reply received at any
// @jevca.art address in one list, filterable by artist/gallery, with a
// thread view (received + any replies sent from here) and a reply box.
// "New message" opens the same compose form used for ad hoc admin
// emails — kept inline here rather than a separate modal component,
// since this is the only place either flow is used.
//
// Plain, minimalist styling, consistent with InvoiceEmailModal/
// SiteSettingsPanel elsewhere in the app — no separate visual language
// for this screen.
export default function AdminInboxPanel({
  initialList,
  artistOptions,
  selectedArtistId,
  composeRecipients,
  adminEmailAddress,
}: {
  initialList: InboxSummaryItem[];
  artistOptions: { id: string; name: string }[];
  selectedArtistId: string | null;
  composeRecipients: ComposeRecipient[];
  adminEmailAddress: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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

  const cardCls = "rounded-lg border border-neutral-200 bg-white";
  const inputCls = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs text-neutral-500";

  const openThread = (id: string) => {
    setOpenId(id);
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

  const handleFilterChange = (value: string) => {
    router.push(value ? `/accounts/inbox?artistId=${value}` : "/accounts/inbox");
  };

  const handleSendReply = () => {
    if (!openId) return;
    setReplyError(null);
    setReplySending(true);
    const fd = new FormData();
    fd.set("body", replyBody);
    startTransition(async () => {
      const res = await sendInboxReply(openId, fd);
      setReplySending(false);
      if (!res.ok) {
        setReplyError(res.error);
        return;
      }
      setReplyBody("");
      openThread(openId); // Reload the thread so the new reply shows up.
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
    fd.set("body", composeBody);
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
      router.refresh();
    });
  };

  const startCompose = () => {
    setOpenId(null);
    setThread(null);
    setComposing(true);
    setComposeTo("");
    setComposeArtistId(null);
    setComposeCustomerId(null);
    setComposeSubject("");
    setComposeBody("");
    setComposeError(null);
    setComposeSent(false);
  };

  return (
    <div className="mx-auto flex h-full max-w-6xl gap-4 px-6 py-6">
      {/* ---- LEFT: list + filter ---- */}
      <div className="flex w-80 shrink-0 flex-col">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-neutral-900">Inbox</h1>
          <button
            type="button"
            onClick={startCompose}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
          >
            New message
          </button>
        </div>

        <select
          value={selectedArtistId || ""}
          onChange={(e) => handleFilterChange(e.target.value)}
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
          {initialList.length === 0 ? (
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
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`truncate text-sm ${m.isRead ? "text-neutral-600" : "font-semibold text-neutral-900"}`}
                      >
                        {m.fromName || m.fromAddress}
                      </span>
                      <span className="shrink-0 text-[10px] text-neutral-400">
                        {new Date(m.receivedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="truncate text-xs text-neutral-500">{m.subject || "(no subject)"}</p>
                    <p className="mt-0.5 truncate text-xs text-neutral-400">
                      {m.artistName ? `${m.artistName}${m.customerName ? ` — ${m.customerName}` : ""}` : "General"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ---- RIGHT: thread or compose ---- */}
      <div className={`${cardCls} min-w-0 flex-1 overflow-y-auto p-5`}>
        {composing ? (
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
        ) : !openId ? (
          <p className="text-center text-sm text-neutral-400">Select a message, or start a new one.</p>
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
                  <span>{new Date(item.at).toLocaleString()}</span>
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
  );
}
