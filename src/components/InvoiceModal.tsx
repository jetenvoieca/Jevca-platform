"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { cancelInvoice, getInvoiceWindow, type InvoiceWindowData } from "@/lib/actions/invoices";
import { getInvoiceEmailDraft, sendInvoiceEmail } from "@/lib/actions/invoiceEmail";
import { formatDate } from "@/lib/formatDate";
import { useBackdropClose } from "@/lib/useBackdropClose";
import ConfirmDialog from "@/components/ConfirmDialog";
import { formatMoney } from "@/lib/currencies";

type Tab = "invoice" | "email";
// The invoice window (2026-10-14; was the Part Three invoice email
// window): one invoice — for one sale or several — with two tabs, the
// real PDF (the same one that's emailed, so the preview can't drift from
// it; titled Receipt once paid) and the email. An unpaid invoice can be
// cancelled from here — kept on record as cancelled, its sales freed.
// It's paid from a sale's own popup (Take Card / Record Payment, which
// pay the whole invoice) or through its payment link, made with it and
// included in the email (2026-10-14: no payment buttons here).
//
// Plain, minimalist styling consistent with the rest of the app.
export default function InvoiceModal({
  invoiceId,
  onClose,
  // Called after anything that changes the invoice or its sales.
  onChanged,
}: {
  invoiceId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const backdrop = useBackdropClose(onClose);
  const [invoice, setInvoice] = useState<InvoiceWindowData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumped whenever the invoice changes, so the preview reloads (e.g. it
  // becomes a receipt once paid).
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<Tab>("invoice");
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // Email tab
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const load = useCallback(() => {
    getInvoiceWindow(invoiceId).then((data) => {
      if (!data) setLoadError("Invoice not found.");
      setInvoice(data);
    });
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  // After a change: reload the invoice, its preview and the email draft
  // (whose wording depends on whether it's paid), and tell the caller.
  const changed = () => {
    load();
    setVersion((v) => v + 1);
    setDraftLoaded(false);
    setDraftError(null);
    setSent(false);
    if (tab === "email") loadDraft();
    onChanged?.();
  };

  const isPaid = invoice?.status === "PAID";
  const docLabel = isPaid ? "Receipt" : "Invoice";
  const isOpen = invoice?.status === "UNPAID";

  function loadDraft() {
    getInvoiceEmailDraft(invoiceId).then((result) => {
      if ("error" in result) {
        setDraftError(result.error);
      } else {
        setTo(result.to);
        setSubject(result.subject);
        setBody(result.body);
      }
      setDraftLoaded(true);
    });
  }

  const openEmailTab = () => {
    setTab("email");
    if (!draftLoaded && !draftError) loadDraft();
  };

  const handleSend = () => {
    setSendError(null);
    const fd = new FormData();
    fd.set("subject", subject);
    fd.set("body", body);
    startTransition(async () => {
      const res = await sendInvoiceEmail(invoiceId, fd);
      if (!res.ok) {
        setSendError(res.error);
        return;
      }
      setSent(true);
      load();
      onChanged?.();
    });
  };

  const handleCancel = () => {
    setConfirmingCancel(false);
    setActionError(null);
    startTransition(async () => {
      const res = await cancelInvoice(invoiceId);
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      changed();
    });
  };

  const tabCls = (on: boolean) =>
    `px-3 py-1 font-medium ${on ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" {...backdrop}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3">
          <div className="flex overflow-hidden rounded-full border border-neutral-300 text-xs">
            <button type="button" onClick={() => setTab("invoice")} className={tabCls(tab === "invoice")}>
              {docLabel}
            </button>
            <button type="button" onClick={openEmailTab} className={tabCls(tab === "email")}>
              Email
            </button>
          </div>
          {invoice && (
            <p className="min-w-0 truncate text-sm font-medium text-neutral-900">
              {docLabel} {invoice.number}
              {invoice.status === "CANCELLED" && <span className="font-normal text-red-700"> · Cancelled</span>}
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

        {invoice && (
          <div className="space-y-0.5 border-b border-neutral-200 px-5 py-3 text-xs text-neutral-500">
            <p>
              Invoiced {formatDate(invoice.createdAt)}
              {invoice.sales.length > 1 && ` · ${invoice.sales.length} sales`}
              {invoice.status === "UNPAID" && ` · ${formatMoney(invoice.balance, invoice.currency)} due`}
            </p>
            {invoice.emailedAt && (
              <p>
                Invoice sent {formatDate(invoice.emailedAt)}
                {invoice.emailedTo && ` to ${invoice.emailedTo}`}
              </p>
            )}
            {invoice.paidAt && <p className="text-green-700">Paid {formatDate(invoice.paidAt)}</p>}
            {invoice.receiptEmailedAt && (
              <p>
                Receipt sent {formatDate(invoice.receiptEmailedAt)}
                {invoice.receiptEmailedTo && ` to ${invoice.receiptEmailedTo}`}
              </p>
            )}
            {invoice.cancelledAt && <p className="text-red-700">Cancelled {formatDate(invoice.cancelledAt)}</p>}
            {invoice.onInstalments && invoice.status === "UNPAID" && (
              <p>Being paid by instalments through Stripe.</p>
            )}

            {isOpen && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmingCancel(true)}
                  disabled={isPending}
                  className="text-sm text-red-700 hover:underline disabled:opacity-50"
                >
                  Cancel invoice
                </button>
              </div>
            )}

            {actionError && <p className="pt-1 text-sm text-red-600">{actionError}</p>}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {tab === "invoice" ? (
            <iframe
              key={version}
              src={`/api/invoice/${invoiceId}?disposition=inline&v=${version}`}
              title={`${docLabel} preview`}
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
                      rows={10}
                      className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <p className="text-xs text-neutral-400">The {docLabel.toLowerCase()} PDF is attached automatically.</p>
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

      <ConfirmDialog
        open={confirmingCancel}
        title={`Cancel invoice ${invoice?.number ?? ""}?`}
        message="It's kept on record, marked as cancelled, and its payment link stops working. Its sales are freed, so they can be changed, paid or put on another invoice."
        confirmLabel="Cancel invoice"
        danger
        onConfirm={handleCancel}
        onCancel={() => setConfirmingCancel(false)}
      />
    </div>
  );
}
