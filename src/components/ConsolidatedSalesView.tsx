"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getArtworkDetailForClient } from "@/lib/actions/artworks";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import { deleteGallerySale, forceDeleteCompletedSale } from "@/lib/actions/payments";
import type { ArtworkDetail } from "@/components/ArtworkDetailPanel";
import PurchasePanel from "@/components/PurchasePanel";
import SaleDetailCard from "@/components/SaleDetailCard";
import GallerySaleCard, { SaleStatusBadge } from "@/components/GallerySaleCard";
import EditSaleButton from "@/components/EditSaleButton";
import ConfirmDialog from "@/components/ConfirmDialog";

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
// direct request — this list was previously read-only, with each site's
// own Sales page as the only place to actually act on a sale). Reuses
// the exact same three-way GallerySaleCard/PurchasePanel/SaleDetailCard
// branching SalesView.tsx already uses per-site, just surfaced as a
// modal here (this page spans every artist, not one site's own sticky
// side panel) rather than duplicating that logic a third time.
export default function ConsolidatedSalesView({ months }: { months: ConsolidatedMonthGroup[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [selectedRow, setSelectedRow] = useState<ConsolidatedSaleRow | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ArtworkDetail | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [saleSources, setSaleSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const openRow = (row: ConsolidatedSaleRow) => {
    setSelectedRow(row);
    setSelectedDetail(null);
    setLoading(true);
    Promise.all([
      getArtworkDetailForClient(row.artworkId),
      getArtworkSettings(row.artistId),
    ]).then(([detail, settings]) => {
      setSelectedDetail(detail);
      setPaymentMethods(settings.paymentMethods);
      setSaleSources(settings.saleSources);
      setLoading(false);
    });
  };

  // Only re-fetches the artwork detail (what actually changes after an
  // action) — Settings-editable lists like paymentMethods don't need
  // refreching on every sale action.
  const refreshSelected = () => {
    if (!selectedRow) return;
    getArtworkDetailForClient(selectedRow.artworkId).then((detail) => setSelectedDetail(detail));
  };

  const closeModal = () => {
    setSelectedRow(null);
    setSelectedDetail(null);
  };

  const handleDeleteSale = (purchaseId: string, siteId: string, invoiceNumber: number | null) => {
    const message = invoiceNumber
      ? `An invoice (#${invoiceNumber}) was already generated for it — deleting will leave a gap in your invoice numbering, which is fine but can't be undone. This removes the sale entirely.`
      : "This removes the sale entirely — it cannot be undone.";
    setPendingConfirm({
      title: "Delete this sale permanently?",
      message,
      confirmLabel: "Delete permanently",
      danger: true,
      onConfirm: () => {
        setPendingConfirm(null);
        startTransition(async () => {
          const res = await deleteGallerySale(purchaseId, siteId);
          if (!res.ok) {
            alert(res.error);
            return;
          }
          closeModal();
          router.refresh();
        });
      },
    });
  };

  // Deliberately harder-to-reach path for a genuinely completed, paid
  // sale — same reasoning as the matching handler in SalesView/
  // PurchasePanel: only for cleaning up test or clearly erroneous data.
  const handleForceDeleteSale = (purchaseId: string, siteId: string) => {
    setPendingConfirm({
      title: "Force delete this completed sale?",
      message:
        "This sale is marked as paid — deleting it removes it as a financial record entirely, permanently, including its invoice/receipt number. Only do this for test or clearly erroneous data, never for a real transaction.",
      confirmLabel: "Force delete",
      danger: true,
      onConfirm: () => {
        setPendingConfirm(null);
        startTransition(async () => {
          const res = await forceDeleteCompletedSale(purchaseId, siteId);
          if (!res.ok) {
            alert(res.error);
            return;
          }
          closeModal();
          router.refresh();
        });
      },
    });
  };

  // The one specific Purchase that was actually clicked — an artwork can
  // have several (an active one plus history), and only one of them is
  // what was asked for.
  const selectedPurchase =
    selectedDetail && selectedRow
      ? [selectedDetail.activePurchase, ...selectedDetail.purchaseHistory].find(
          (p) => p?.id === selectedRow.purchaseId
        ) || null
      : null;

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
                    onClick={() => openRow(r)}
                    className="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50"
                  >
                    <td className="truncate px-3 py-1.5">{r.artistName}</td>
                    <td className="truncate px-3 py-1.5">{r.artworkTitle}</td>
                    <td className="truncate px-3 py-1.5 text-neutral-500">{r.buyerName || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      {new Date(r.createdAt).toLocaleDateString("en-GB")}
                    </td>
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeModal}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {loading || !selectedDetail ? (
              <p className="py-8 text-center text-sm text-neutral-400">Loading…</p>
            ) : (
              <>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {selectedDetail.images[0] ? (
                      <img
                        src={selectedDetail.images[0].url}
                        alt=""
                        className="h-16 w-16 rounded object-cover"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded bg-neutral-100" />
                    )}
                    <div>
                      <h2 className="text-sm font-semibold text-neutral-900">
                        {selectedDetail.presentationTitle}
                      </h2>
                      <p className="text-xs text-neutral-400">
                        #{selectedDetail.catalogueNumber}
                        {selectedDetail.type ? ` · ${selectedDetail.type}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Shared component (2026-09-12) — see
                        EditSaleButton.tsx. Renders nothing unless
                        selectedPurchase is an ACTIVE gallery sale. */}
                    <EditSaleButton
                      purchase={selectedPurchase}
                      siteId={selectedRow.siteId ?? ""}
                      onChanged={refreshSelected}
                    />
                    <button
                      type="button"
                      onClick={closeModal}
                      className="rounded-md border border-neutral-300 px-2 py-[2px] text-xs hover:bg-neutral-50"
                    >
                      Close
                    </button>
                  </div>
                </div>

                {!selectedPurchase || !selectedRow.siteId ? (
                  <p className="text-sm text-neutral-400">
                    {!selectedRow.siteId
                      ? "This artist has no active site to manage the sale from."
                      : "This sale couldn't be found — it may have changed since the list loaded."}
                  </p>
                ) : selectedPurchase.channel === "GALLERY" && selectedPurchase.status !== "ABANDONED" ? (
                  <GallerySaleCard
                    purchase={selectedPurchase}
                    siteId={selectedRow.siteId}
                    paymentMethods={paymentMethods}
                    onChanged={refreshSelected}
                  />
                ) : selectedPurchase.status === "ACTIVE" ? (
                  <PurchasePanel
                    artworkId={selectedRow.artworkId}
                    artistId={selectedRow.artistId}
                    siteId={selectedRow.siteId}
                    terms={selectedDetail.saleTerms}
                    activePurchase={selectedDetail.activePurchase}
                    history={selectedDetail.purchaseHistory}
                    saleSources={saleSources}
                    onChanged={refreshSelected}
                  />
                ) : (
                  <SaleDetailCard
                    purchase={selectedPurchase}
                    siteId={selectedRow.siteId!}
                    artworkType={selectedDetail.type}
                    artworkSize={selectedDetail.size}
                    artworkGroup={selectedDetail.catalogueGroup}
                    artworkMedium={selectedDetail.medium}
                    onDelete={
                      selectedPurchase.status !== "COMPLETED"
                        ? () =>
                            handleDeleteSale(
                              selectedPurchase.id,
                              selectedRow.siteId!,
                              selectedPurchase.invoiceNumber
                            )
                        : undefined
                    }
                    onForceDelete={
                      selectedPurchase.status === "COMPLETED"
                        ? () => handleForceDeleteSale(selectedPurchase.id, selectedRow.siteId!)
                        : undefined
                    }
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ""}
        message={pendingConfirm?.message ?? ""}
        confirmLabel={pendingConfirm?.confirmLabel ?? ""}
        danger={pendingConfirm?.danger}
        onConfirm={() => pendingConfirm?.onConfirm()}
        onCancel={() => setPendingConfirm(null)}
      />
    </>
  );
}
