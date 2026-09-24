"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/formatDate";
import { SaleStatusBadge } from "@/components/GallerySaleCard";
import SaleModal, { type SaleModalTarget } from "@/components/SaleModal";
import type { SaleRow } from "@/lib/actions/sales";

const STATUS_FILTERS = ["ALL", "ACTIVE", "COMPLETED", "ABANDONED"] as const;

function formatMoney(amount: string, currency: string) {
  const n = parseFloat(amount);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
}

// One site's Sales list. Clicking a row opens the shared SaleModal —
// the same modal Consolidated Sales and the Inbox use, so a sale looks
// and behaves identically wherever it's opened.
export default function SalesView({
  siteId,
  artistId,
  sales,
}: {
  siteId: string;
  artistId: string;
  sales: SaleRow[];
}) {
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>("ALL");
  const [target, setTarget] = useState<SaleModalTarget | null>(null);
  const router = useRouter();

  const filtered = useMemo(
    () => (filter === "ALL" ? sales : sales.filter((s) => s.status === filter)),
    [sales, filter]
  );

  // Completed sales, summed per currency (GBP and EUR kept separate).
  const totals = useMemo(() => {
    const byCurrency: Record<string, number> = {};
    let count = 0;
    for (const s of sales) {
      if (s.status !== "COMPLETED") continue;
      count++;
      byCurrency[s.currency] = (byCurrency[s.currency] || 0) + parseFloat(s.totalAmount);
    }
    return { count, byCurrency };
  }, [sales]);

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Sales</h1>
      <p className="mb-4 text-sm text-neutral-500">
        {totals.count === 0
          ? "No completed sales yet."
          : `${totals.count} completed sale${totals.count === 1 ? "" : "s"} · ${Object.entries(
              totals.byCurrency
            )
              .map(([cur, amt]) => formatMoney(amt.toFixed(2), cur))
              .join(" · ")}`}
      </p>

      <div className="mb-4 flex gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === f
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-400">
              <th className="px-3 py-2 font-normal">Artwork</th>
              <th className="px-3 py-2 font-normal">Buyer</th>
              <th className="px-3 py-2 font-normal">Type</th>
              <th className="px-3 py-2 font-normal">Amount</th>
              <th className="px-3 py-2 font-normal">Net</th>
              <th className="px-3 py-2 font-normal">Status</th>
              <th className="px-3 py-2 font-normal">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-neutral-400">
                  Nothing here yet.
                </td>
              </tr>
            )}
            {filtered.map((s) => (
              <tr
                key={s.purchaseId}
                onClick={() =>
                  setTarget({ purchaseId: s.purchaseId, artworkId: s.artworkId, artistId, siteId })
                }
                className={`cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50 ${
                  target?.purchaseId === s.purchaseId ? "bg-neutral-50" : ""
                }`}
              >
                <td className="flex items-center gap-2 px-3 py-2">
                  {s.artworkThumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.artworkThumbnail} alt="" className="h-8 w-8 rounded object-cover" />
                  ) : (
                    <div className="h-8 w-8 rounded bg-neutral-100" />
                  )}
                  <span className="truncate">{s.artworkTitle}</span>
                </td>
                <td className="px-3 py-2 text-neutral-600">{s.buyerName || s.buyerEmail}</td>
                <td className="px-3 py-2 text-neutral-500">
                  {s.type === "FULL" ? "Full" : "Instalments"}
                </td>
                <td className="px-3 py-2">{formatMoney(s.totalAmount, s.currency)}</td>
                <td className="px-3 py-2">{formatMoney(s.netAmount, s.currency)}</td>
                <td className="px-3 py-2">
                  <SaleStatusBadge status={s.status} invoiceEmailedAt={s.invoiceEmailedAt} />
                </td>
                <td className="px-3 py-2 text-neutral-400">{formatDate(s.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {target && (
        <SaleModal
          target={target}
          onClose={() => setTarget(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}
