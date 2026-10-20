"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  getStatementEmailDraft,
  getStatementWindow,
  sendStatementEmail,
  type StatementWindowData,
} from "@/lib/actions/statements";
import { formatDate } from "@/lib/formatDate";
import { useBackdropClose } from "@/lib/useBackdropClose";

type Tab = "statement" | "email";

function formatMoney(amount: string, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(parseFloat(amount));
}

// The statement window (2026-10-20) — same layout as the invoice window
// (InvoiceModal): the real PDF (the one that's emailed) and the email,
// whose message lists each work still owed with its payment link, then
// the link for them all. See lib/actions/statements.ts.
export default function StatementModal({
  statementId,
  onClose,
  onChanged,
}: {
  statementId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const backdrop = useBackdropClose(onClose);
  const [statement, setStatement] = useState<StatementWindowData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("statement");
  const [isPending, startTransition] = useTransition();

  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const load = useCallback(() => {
    getStatementWindow(statementId).then((data) => {
      if (!data) setLoadError("Statement not found.");
      setStatement(data);
    });
  }, [statementId]);

  useEffect(() => {
    load();
  }, [load]);

  const openEmailTab = () => {
    setTab("email");
    if (draftLoaded || draftError) return;
    getStatementEmailDraft(statementId).then((result) => {
      if ("error" in result) {
        setDraftError(result.error);
      } else {
        setTo(result.to);
        setSubject(result.subject);
        setBody(result.body);
      }
      setDraftLoaded(true);
    });
  };

  const handleSend = () => {
    setSendError(null);
    const fd = new FormData();
    fd.set("subject", subject);
    fd.set("body", body);
    startTransition(async () => {
      const res = await sendStatementEmail(statementId, fd);
      if (!res.ok) {
        setSendError(res.error);
        return;
      }
      setSent(true);
      load();
      onChanged?.();
    });
  };

  const tabCls = (on: boolean) =>
    `px-3 py-1 font-medium ${on ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" {...backdrop}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3">
          <div className="flex overflow-hidden rounded-full border border-neutral-300 text-xs">
            <button type="button" onClick={() => setTab("statement")} className={tabCls(tab === "statement")}>
              Statement
            </button>
            <button type="button" onClick={openEmailTab} className={tabCls(tab === "email")}>
              Email
            </button>
          </div>
          {statement && (
            <p className="min-w-0 truncate text-sm font-medium text-neutral-900">
              Statement · {statement.galleryName}
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
          >
            Close
          </button>
        </div>

        {loadError && <p className="px-5 py-4 text-sm text-red-600">{loadError}</p>}

        {statement && (
          <div className="space-y-0.5 border-b border-neutral-200 px-5 py-3 text-xs text-neutral-500">
            <p>
              Made {formatDate(statement.createdAt)} · {statement.workCount} work
              {statement.workCount === 1 ? "" : "s"}
              {statement.totals.length > 0 &&
                ` · ${statement.totals.map((t) => formatMoney(t.amount, t.currency)).join(" + ")} owed`}
            </p>
            {statement.emailedAt && (
              <p>
                Sent {formatDate(statement.emailedAt)}
                {statement.emailedTo && ` to ${statement.emailedTo}`}
              </p>
            )}
            {statement.paidAt && <p className="text-green-700">Paid in full {formatDate(statement.paidAt)}</p>}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {tab === "statement" ? (
            <iframe
              src={`/api/statement/${statementId}?disposition=inline`}
              title="Statement preview"
              className="h-[60vh] w-full"
            />
          ) : (
            <div className="space-y-3 p-5">
              {draftError ? (
                <p className="text-sm text-red-600">{draftError}</p>
              ) : !draftLoaded ? (
                <p className="text-sm text-neutral-400">Loading…</p>
              ) : sent ? (
                <p className="text-sm text-green-600">Sent to {to}.</p>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs text-neutral-500">To</label>
                    <p className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-sm text-neutral-700">
                      {to}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-neutral-500">Subject</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-neutral-500">Message</label>
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={12}
                      className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <p className="text-xs text-neutral-400">The statement PDF is attached automatically.</p>
                  {sendError && <p className="text-sm text-red-600">{sendError}</p>}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={isPending}
                      className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                    >
                      {isPending ? "Sending…" : "Send email"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
