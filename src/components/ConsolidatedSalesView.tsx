"use client";

import { useState } from "react";
import { SaleStatusBadge } from "@/components/GallerySaleCard";
import SaleModal from "@/components/SaleModal";
import { formatDate } from "@/lib/formatDate";

export type ConsolidatedSaleRow = {
  purchaseId: string;
  artworkId: string;
  artistId: string;
  siteId: string | null;
  artistName: string;
  artworkTitle: string;
  buyerName: string | null;
  grossAmount: number;
  netAmount: number;
  commissionPercent: number | null;
  currency: string;
  status: "ACTIVE" | "COMPLETED" | "ABANDONED";
  // ISO string, not a Date — Server Components can only hand plain
  // serializable data across to a Client Component like this one.
  createdAt: string;
  // Added 2026-09-12 so this list's own Status column can use the same
  // shared SaleStatusBadge (GallerySaleCard.tsx) as everywhere else a
  // sale's status is shown, rather than a second hand-rolled version —
  // shows "Invoice sent" instead of "UNPAID" once one's gone out.
  invoiceEmailedAt: string | null;
};

export type ConsolidatedMonthGroup = {
  key: string;
  label: string;
  totalsByCurrency: Record<string, number>;
  rows: ConsolidatedSaleRow[];
};

// Click-through detail modal for a Consolidated Sales row (2026-09-09,
// direct request). The modal itself lives in SaleModal.tsx (2026-09-19),
// shared with the Inbox's overdue-invoice alerts so both open exactly the
// same thing.
export default function ConsolidatedSalesView({ months }: { months: ConsolidatedMonthGroup[] }) {
  const [selectedRow, setSelectedRow] = useState<ConsolidatedSaleRow | null>(null);

  return (
    <>
      <div className="space-y-3">
        {months.map((g) => (
          <details key={g.key} className="group rounded-lg border border-neutral-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
              <span className="text-sm font-medium text-neutral-900">{g.label}</span>
              <span className="flex items-center gap-3">
                <span className="text-sm text-neutral-600">
                  {Object.entries(g.totalsByCurrency)
                    .map(([currency, total]) => `${currency} ${total.toFixed(2)}`)
                    .join("  ·  ")}
                </span>
                <span className="text-xs text-neutral-400">
                  {g.rows.length} sale{g.rows.length === 1 ? "" : "s"}
                </span>
              </span>
            </summary>
            <table className="w-full table-fixed border-t border-neutral-100 text-xs">
              <thead className="bg-neutral-50 text-left text-neutral-400">
                <tr>
                  {/* Rebalanced (2026-09-12) — Status was 10% and
                      "Invoice sent" wrapped onto two lines. Widening the
                      whole page just spaced every column out further
                      without helping Status specifically, so instead
                      Artist/Artwork/Buyer/Date/Amount are each tightened
                      a little (also px-3 not px-4) and that room goes to
                      Status. */}
                  <th className="w-[15%] px-3 py-1.5 font-medium">Artist</th>
                  <th className="w-[20%] px-3 py-1.5 font-medium">Artwork</th>
                  <th className="w-[15%] px-3 py-1.5 font-medium">Buyer</th>
                  <th className="w-[12%] px-3 py-1.5 font-medium">Date</th>
                  <th className="w-[14%] px-3 py-1.5 font-medium">Amount</th>
                  <th className="w-[24%] px-3 py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr
                    key={r.purchaseId}
                    onClick={() => setSelectedRow(r)}
                    className="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50"
                  >
                    <td className="truncate px-3 py-1.5">{r.artistName}</td>
                    <td className="truncate px-3 py-1.5">{r.artworkTitle}</td>
                    <td className="truncate px-3 py-1.5 text-neutral-500">{r.buyerName || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{formatDate(r.createdAt)}</td>
                    {/* Commentary removed (2026-09-12 mockup) — was
                        "(net of X%, gross CUR Y)" appended after every
                        commissioned row, which wrapped rows onto three
                        lines and cluttered the table. The net figure
                        alone is what the intro banner above already
                        promises this column shows; gross/commission are
                        still on the underlying row (and on the sale's
                        own detail card) for anyone who needs them. */}
                    <td className="whitespace-nowrap px-3 py-1.5">
                      {r.currency} {r.netAmount.toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      {/* Shared badge (2026-09-12) — was its own
                          hand-rolled coloured text here (STATUS_STYLE
                          lookup), the one place on this page that didn't
                          read invoiceEmailedAt like the detail modal
                          below it already does. Same component used on
                          the Sales page and Galleries' Sales tab, so
                          "Invoice sent" is consistent everywhere. */}
                      <SaleStatusBadge status={r.status} invoiceEmailedAt={r.invoiceEmailedAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ))}
      </div>

      {selectedRow && (
        <SaleModal
          key={selectedRow.purchaseId}
          target={selectedRow}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </>
  );
}
