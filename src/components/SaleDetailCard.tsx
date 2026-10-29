"use client";

import { useState, useTransition } from "react";
import type { PurchaseDetail } from "@/lib/actions/payments";
import { formatDate } from "@/lib/formatDate";
import { hasInvoiceToOpen, invoiceToOpen } from "@/lib/saleInvoice";
import CertificateEmailModal from "@/components/CertificateEmailModal";
import InvoiceModal from "@/components/InvoiceModal";
import { useClientWords } from "@/components/ClientWordsProvider";
import { formatMoney } from "@/lib/currencies";

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="text-sm text-neutral-800">{value}</dd>
    </div>
  );
}

export default function SaleDetailCard({
  purchase,
  siteId,
  artworkType,
  artworkSize,
  artworkMedium,
  onDelete,
  onForceDelete,
}: {
  purchase: PurchaseDetail;
  // Needed for CertificateEmailModal below (2026-09-10) — this card is
  // read-only otherwise, but issuing a certificate is a real action
  // (sends an email, logs a sent record) that needs to revalidate the
  // right site's own pages.
  siteId: string;
  artworkType: string | null;
  artworkSize: string | null;
  artworkMedium: string | null;
  // Only ever passed for an abandoned (never-paid) sale — the parent
  // decides eligibility, this component just renders the button when
  // asked to (2026-08-13, widened from gallery-only to any channel).
  onDelete?: () => void;
  // Separate, deliberately scarier option — only ever passed for a
  // completed sale, since deleting one destroys a real financial record
  // (2026-08-13, added for cleaning up test/erroneous completed sales).
  onForceDelete?: () => void;
}) {
  const words = useClientWords();
  // Certificate of Authenticity (2026-09-10, direct request — "add to
  // all sales, completed or not") — available here for any non-
  // abandoned purchase this card shows (completed Stripe, or an
  // abandoned/completed gallery sale reached via this generic card
  // rather than GallerySaleCard's own interactive one).
  const [showCertificateModal, setShowCertificateModal] = useState(false);
  // The sale's invoice or receipt (2026-10-14) — see invoiceToOpen. A
  // past sale's invoice is only ever looked at or re-sent here.
  const [invoiceModalId, setInvoiceModalId] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const openInvoice = () => {
    setInvoiceError(null);
    startTransition(async () => {
      const res = await invoiceToOpen(purchase);
      if (res.ok) setInvoiceModalId(res.invoiceId);
      else setInvoiceError(res.error);
    });
  };
  // The next instalment still owed, if this sale was abandoned partway
  // through an instalment plan — irrelevant (and absent) for a fully
  // Completed sale, since nothing's left due.
  const nextDue = purchase.payments.find((p) => p.status === "DUE");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-400">
          {purchase.status === "COMPLETED" ? "Completed" : "Abandoned"}
          {purchase.closedAt ? ` on ${formatDate(purchase.closedAt)}` : ""} — a
          past transaction, shown for reference only.
        </p>
        <div className="flex items-center gap-2">
          {hasInvoiceToOpen(purchase) && (
            <button
              type="button"
              onClick={openInvoice}
              disabled={isPending}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
            >
              {purchase.status === "COMPLETED" ? "Receipt" : "Invoice"}
            </button>
          )}
          {purchase.status === "COMPLETED" && (
            <button
              type="button"
              onClick={() => setShowCertificateModal(true)}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
            >
              {purchase.certificateEmailedAt ? "Send certificate again" : "Certificate of Authenticity"}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          )}
          {onForceDelete && (
            <button
              type="button"
              onClick={onForceDelete}
              className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              Force delete
            </button>
          )}
        </div>
      </div>
      {invoiceError && <p className="text-xs text-red-600">{invoiceError}</p>}

      <dl className="grid grid-cols-2 gap-3">
        <Field label="Type" value={artworkType} />
        <Field label="Size" value={artworkSize} />
        <Field label="Medium" value={artworkMedium} />

        <div className="col-span-2 border-t border-neutral-100 pt-3">
          <dt className="text-xs uppercase tracking-wide text-neutral-400">
            {purchase.channel === "GALLERY" ? "Sale price" : purchase.type === "FULL" ? "Price paid" : "Total price"}
          </dt>
          <dd className="text-sm text-neutral-800">
            {formatMoney(purchase.totalAmount, purchase.currency)}
            {purchase.type === "INSTALMENTS" ? ` (${purchase.instalmentCount} instalments)` : ""}
          </dd>
        </div>

        {purchase.channel === "GALLERY" && purchase.commissionPercent && (
          <div className="col-span-2">
            <dt className="text-xs uppercase tracking-wide text-neutral-400">
              Commission ({purchase.commissionPercent}%) — net paid
            </dt>
            <dd className="text-sm text-neutral-800">
              {formatMoney(
                (
                  parseFloat(purchase.totalAmount) *
                  (1 - parseFloat(purchase.commissionPercent) / 100)
                ).toFixed(2),
                purchase.currency
              )}
            </dd>
          </div>
        )}

        {nextDue && (
          <>
            <Field
              label="Next instalment due"
              value={nextDue.dueDate ? formatDate(nextDue.dueDate) : "—"}
            />
            <Field label="Next instalment amount" value={formatMoney(nextDue.amount, nextDue.currency)} />
          </>
        )}

        <div className="col-span-2 border-t border-neutral-100 pt-3">
          <Field label="Customer name" value={purchase.buyerName} />
        </div>
        <div className="col-span-2">
          <Field label="Customer email" value={purchase.buyerEmail} />
        </div>
        <div className="col-span-2">
          <Field label="Sale source" value={purchase.source} />
        </div>
        <div className="col-span-2">
          <Field label="Sold via" value={purchase.channel === "GALLERY" ? words.location : "Stripe"} />
        </div>
      </dl>

      {purchase.payments.length > 0 && (
        <div className="border-t border-neutral-100 pt-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-neutral-400">Payment history</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-400">
                <th className="pb-1 font-normal">#</th>
                <th className="pb-1 font-normal">Amount</th>
                <th className="pb-1 font-normal">Status</th>
                <th className="pb-1 font-normal">Date</th>
              </tr>
            </thead>
            <tbody>
              {purchase.payments.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100">
                  <td className="py-1.5 text-neutral-500">{p.sequence}</td>
                  <td className="py-1.5">{formatMoney(p.amount, p.currency)}</td>
                  <td className="py-1.5">
                    <span
                      className={
                        p.status === "PAID"
                          ? "text-green-600"
                          : p.status === "FAILED"
                            ? "text-red-600"
                            : "text-neutral-500"
                      }
                    >
                      {p.status === "PAID" ? "Paid" : p.status === "FAILED" ? "Failed" : "Due"}
                    </span>
                  </td>
                  <td className="py-1.5 text-neutral-500">
                    {p.paidDate ? formatDate(p.paidDate) : p.dueDate ? formatDate(p.dueDate) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCertificateModal && (
        <CertificateEmailModal
          purchaseId={purchase.id}
          siteId={siteId}
          onClose={() => setShowCertificateModal(false)}
        />
      )}

      {invoiceModalId && (
        <InvoiceModal invoiceId={invoiceModalId} onClose={() => setInvoiceModalId(null)} />
      )}
    </div>
  );
}
