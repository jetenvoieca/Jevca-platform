"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  getStatementChoices,
  getStatementEmailDraft,
  getStatementWindow,
  makeStatement,
  sendStatementEmail,
  type StatementChoice,
  type StatementWindowData,
} from "@/lib/actions/statements";
import { formatDate } from "@/lib/formatDate";
import { useBackdropClose } from "@/lib/useBackdropClose";
import { SaleStatusBadge } from "@/components/GallerySaleCard";
import { formatMoney } from "@/lib/currencies";

type Tab = "statement" | "email";

// The statement window for a Gallery location (2026-10-20). First the
// works still owed there, each with a tick box (Craig's request: choose
// what goes on it) — the current statement's works ticked, or else the
// OVERDUE ones, or else all. Make statement then shows the same layout as
// the invoice window (InvoiceModal): the real PDF (the one that's
// emailed) and the email, whose message lists each work, then the one
// link to pay the whole statement; Change works goes back to the list.
// See lib/actions/statements.ts.
export default function StatementModal({
  customerId,
  galleryName,
  onClose,
}: {
  customerId: string;
  galleryName: string;
  onClose: () => void;
}) {
  const backdrop = useBackdropClose(onClose);
  const [isPending, startTransition] = useTransition();

  // Choosing
  const [choices, setChoices] = useState<StatementChoice[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [chooseError, setChooseError] = useState<string | null>(null);

  // The statement made
  const [statementId, setStatementId] = useState<string | null>(null);
  const [statement, setStatement] = useState<StatementWindowData | null>(null);
  const [tab, setTab] = useState<Tab>("statement");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const loadChoices = useCallback(() => {
    setChoices(null);
    setChooseError(null);
    getStatementChoices(customerId).then((res) => {
      if (!res.ok) {
        setChooseError(res.error);
        return;
      }
      const overdue = res.choices.filter((c) => c.overdue).map((c) => c.purchaseId);
      const start = res.current.length > 0 ? res.current : overdue.length > 0 ? overdue : res.choices.map((c) => c.purchaseId);
      setChoices(res.choices);
      setTicked(new Set(start));
    });
  }, [customerId]);

  useEffect(() => {
    loadChoices();
  }, [loadChoices]);

  const loadStatement = (id: string) => {
    getStatementWindow(id).then(setStatement);
  };

  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleMake = () => {
    setChooseError(null);
    startTransition(async () => {
      const res = await makeStatement(customerId, [...ticked]);
      if (!res.ok) {
        setChooseError(res.error);
        return;
      }
      setStatementId(res.statementId);
      setStatement(null);
      setTab("statement");
      setDraftLoaded(false);
      setDraftError(null);
      setSent(false);
      setSendError(null);
      loadStatement(res.statementId);
    });
  };

  const changeWorks = () => {
    setStatementId(null);
    loadChoices();
  };

  const openEmailTab = () => {
    setTab("email");
    if (!statementId || draftLoaded || draftError) return;
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
    if (!statementId) return;
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
      loadStatement(statementId);
    });
  };

  // What the ticked works come to, per currency.
  const tickedTotals = new Map<string, number>();
  for (const c of choices ?? []) {
    if (ticked.has(c.purchaseId)) tickedTotals.set(c.currency, (tickedTotals.get(c.currency) ?? 0) + parseFloat(c.amount));
  }

  const tabCls = (on: boolean) =>
    `px-3 py-1 font-medium ${on ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" {...backdrop}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3">
          {statementId ? (
            <div className="flex overflow-hidden rounded-full border border-neutral-300 text-xs">
              <button type="button" onClick={() => setTab("statement")} className={tabCls(tab === "statement")}>
                Statement
              </button>
              <button type="button" onClick={openEmailTab} className={tabCls(tab === "email")}>
                Email
              </button>
            </div>
          ) : (
            <span />
          )}
          <p className="min-w-0 truncate text-sm font-medium text-neutral-900">Statement · {galleryName}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
          >
            Close
          </button>
        </div>

        {!statementId ? (
          // ---- Choosing the works ----
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {chooseError && <p className="mb-2 text-sm text-red-600">{chooseError}</p>}
              {!choices ? (
                !chooseError && <p className="text-sm text-neutral-400">Loading…</p>
              ) : choices.length === 0 ? (
                <p className="text-sm text-neutral-500">Nothing is owed at this gallery.</p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-neutral-500">Tick the works to put on the statement.</p>
                  <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
                    {choices.map((c) => (
                      <li key={c.purchaseId}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-neutral-50">
                          <input
                            type="checkbox"
                            checked={ticked.has(c.purchaseId)}
                            onChange={() => toggle(c.purchaseId)}
                            className="h-4 w-4 shrink-0 accent-neutral-700"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-neutral-900">{c.title}</span>
                            <span className="block text-xs text-neutral-500">
                              Sold {formatDate(c.soldAt)} · {c.invoiceNumber ? `Invoice ${c.invoiceNumber}` : "Not invoiced"}
                            </span>
                          </span>
                          {c.overdue && <SaleStatusBadge status="ACTIVE" overdue />}
                          <span className="shrink-0 text-neutral-800">{formatMoney(c.amount, c.currency)}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            {choices && choices.length > 0 && (
              <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-5 py-3">
                <p className="text-sm text-neutral-600">
                  {ticked.size} work{ticked.size === 1 ? "" : "s"}
                  {tickedTotals.size > 0 &&
                    ` · ${[...tickedTotals].map(([cur, n]) => formatMoney(n.toFixed(2), cur)).join(" + ")}`}
                </p>
                <button
                  type="button"
                  onClick={handleMake}
                  disabled={isPending || ticked.size === 0}
                  className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                >
                  {isPending ? "Making…" : "Make statement"}
                </button>
              </div>
            )}
          </div>
        ) : (
          // ---- The statement made ----
          <>
            {statement && (
              <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-3 text-xs text-neutral-500">
                <div className="space-y-0.5">
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
                <button
                  type="button"
                  onClick={changeWorks}
                  disabled={isPending}
                  className="shrink-0 text-sm text-neutral-700 hover:underline disabled:opacity-50"
                >
                  Change works
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {tab === "statement" ? (
                <iframe
                  key={statementId}
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
          </>
        )}
      </div>
    </div>
  );
}
