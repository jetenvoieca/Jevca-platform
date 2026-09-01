"use client";

import { useState, useTransition } from "react";
import { getInvoiceEmailDraft, sendInvoiceEmail } from "@/lib/actions/invoiceEmail";

type Tab = "invoice" | "email";

// Part Three (2026-09-01) — deliberately its own small component, not
// folded into GalleriesView, since this is a self-contained "preview,
// then send" flow that could plausibly be reused elsewhere later (e.g.
// the Sales tab, or the Artwork Catalogue's own Payment view) without
// dragging the whole Gallery panel along with it.
//
// Plain, minimalist styling on purpose — an earlier mockup for this
// screen visually mimicked Gmail's own compose window, but the actual
// preference (2026-08-31) was a clean look consistent with the rest of
// the app, not a pastiche of another product's UI.
//
// The Invoice tab embeds the real PDF endpoint directly (same one
// "Download invoice" uses elsewhere) rather than re-rendering an HTML
// copy of it — what's previewed here is guaranteed to be exactly what
// gets attached when the email is sent, with nothing that could drift
// out of sync between two separate renderers. Uses ?disposition=inline
// (2026-09-01 fix) so the browser renders the PDF inside this iframe
// instead of trying to download it — the plain "Download invoice"
// buttons elsewhere in the app hit the same route without that param,
// so they still get a real download, unchanged.
export default function InvoiceEmailModal({
  purchaseId,
  siteId,
  onClose,
  onSent,
}: {
  purchaseId: string;
  siteId: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("invoice");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const openEmailTab = () => {
    setTab("email");
    if (draftLoaded || draftError) return;
    getInvoiceEmailDraft(purchaseId).then((result) => {
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
      const res = await sendInvoiceEmail(purchaseId, siteId, fd);
      if (!res.ok) {
        setSendError(res.error);
        return;
      }
      setSent(true);
      if (onSent) onSent();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <div className="flex overflow-hidden rounded-full border border-neutral-300 text-xs">
            <button
              type="button"
              onClick={() => setTab("invoice")}
              className={`px-3 py-1 font-medium ${
                tab === "invoice"
                  ? "bg-neutral-900 text-white"
                  : "bg-white text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              Invoice
            </button>
            <button
              type="button"
              onClick={openEmailTab}
              className={`px-3 py-1 font-medium ${
                tab === "email"
                  ? "bg-neutral-900 text-white"
                  : "bg-white text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              Email
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === "invoice" ? (
            <iframe
              src={`/api/invoice/${purchaseId}?disposition=inline`}
              title="Invoice preview"
              className="h-[65vh] w-full"
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
                  <p className="text-xs text-neutral-400">The invoice PDF is attached automatically.</p>
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
