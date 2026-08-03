"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { getArtworkDetailForClient } from "@/lib/actions/artworks";
import type { ArtworkDetail } from "@/components/ArtworkDetailPanel";
import PurchasePanel from "@/components/PurchasePanel";
import type { SaleRow } from "@/lib/actions/sales";

const STATUS_FILTERS = ["ALL", "ACTIVE", "COMPLETED", "ABANDONED"] as const;

function formatMoney(amount: string, currency: string) {
  const n = parseFloat(amount);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
}

export default function SalesView({ siteId, sales }: { siteId: string; sales: SaleRow[] }) {
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>("ALL");
  const [selectedArtworkId, setSelectedArtworkId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ArtworkDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(
    () => (filter === "ALL" ? sales : sales.filter((s) => s.status === filter)),
    [sales, filter]
  );

  // Completed sales, summed per currency (kept separate rather than
  // added together, since GBP and EUR totals shouldn't be combined into
  // one number).
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

  const openRow = (artworkId: string) => {
    setSelectedArtworkId(artworkId);
    setSelectedDetail(null);
    setLoading(true);
    getArtworkDetailForClient(artworkId).then((detail) => {
      setSelectedDetail(detail);
      setLoading(false);
    });
  };

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

      <div className={selectedArtworkId ? "grid gap-6" : ""} style={selectedArtworkId ? { gridTemplateColumns: "1fr 480px" } : undefined}>
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-400">
                <th className="px-3 py-2 font-normal">Artwork</th>
                <th className="px-3 py-2 font-normal">Buyer</th>
                <th className="px-3 py-2 font-normal">Type</th>
                <th className="px-3 py-2 font-normal">Amount</th>
                <th className="px-3 py-2 font-normal">Status</th>
                <th className="px-3 py-2 font-normal">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-neutral-400">
                    Nothing here yet.
                  </td>
                </tr>
              )}
              {filtered.map((s) => (
                <tr
                  key={s.purchaseId}
                  onClick={() => openRow(s.artworkId)}
                  className={`cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50 ${
                    selectedArtworkId === s.artworkId ? "bg-neutral-50" : ""
                  }`}
                >
                  <td className="flex items-center gap-2 px-3 py-2">
                    {s.artworkThumbnail ? (
                      <img
                        src={s.artworkThumbnail}
                        alt=""
                        className="h-8 w-8 rounded object-cover"
                      />
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
                  <td className="px-3 py-2">
                    <span
                      className={
                        s.status === "COMPLETED"
                          ? "text-green-600"
                          : s.status === "ABANDONED"
                            ? "text-neutral-400"
                            : "text-amber-600"
                      }
                    >
                      {s.status.charAt(0) + s.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-neutral-400">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedArtworkId && (
          <div className="sticky top-4 self-start rounded-lg border border-neutral-200 bg-white p-5">
            {loading || !selectedDetail ? (
              <p className="text-sm text-neutral-400">Loading…</p>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {selectedDetail.images[0] ? (
                      <img
                        src={selectedDetail.images[0].url}
                        alt=""
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded bg-neutral-100" />
                    )}
                    <div>
                      <h2 className="text-sm font-semibold text-neutral-900">
                        {selectedDetail.presentationTitle}
                      </h2>
                      <p className="text-xs text-neutral-400">
                        #{selectedDetail.catalogueNumber}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/sites/${siteId}/artworks/${selectedArtworkId}`}
                      className="text-xs text-neutral-500 hover:underline"
                    >
                      Open full editor →
                    </Link>
                    <button
                      type="button"
                      onClick={() => setSelectedArtworkId(null)}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <PurchasePanel
                  artworkId={selectedArtworkId}
                  siteId={siteId}
                  terms={selectedDetail.saleTerms}
                  activePurchase={selectedDetail.activePurchase}
                  history={selectedDetail.purchaseHistory}
                  onChanged={() => openRow(selectedArtworkId)}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
