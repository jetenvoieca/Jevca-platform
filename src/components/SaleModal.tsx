"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getArtworkDetailForClient } from "@/lib/actions/artworks";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import { deleteGallerySale, forceDeleteCompletedSale, type PurchaseDetail } from "@/lib/actions/payments";
import { invoiceCancelNote } from "@/lib/saleInvoice";
import type { ArtworkDetail } from "@/components/ArtworkDetailPanel";
import PurchasePanel from "@/components/PurchasePanel";
import SaleDetailCard from "@/components/SaleDetailCard";
import { ConsignedSaleSummary, SaleStatusBadge } from "@/components/GallerySaleCard";
import SaleHeader from "@/components/SaleHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useBackdropClose } from "@/lib/useBackdropClose";
import ClientWordsProvider from "@/components/ClientWordsProvider";
import type { ClientKind } from "@/lib/clientKind";

// Which sale to show — just enough to look it up.
export type SaleModalTarget = {
  purchaseId: string;
  artworkId: string;
  artistId: string;
  siteId: string | null;
};

// The detail modal for one sale (2026-09-09 as part of Consolidated Sales,
// direct request — that list was previously read-only, with each site's
// own Sales page as the only place to actually act on a sale). Pulled
// out into its own component (2026-09-19) so the Inbox's overdue-invoice
// alerts can open exactly the same modal rather than a second copy of it.
// Also used by each site's own Sales page (SalesView), so a sale looks
// and behaves the same wherever it's opened.
//
// A consigned sale (one made at a Location) is managed only from its
// Location (2026-10-14, "a single source"): here it's shown read-only,
// with Open in location going straight to it there. Only a direct sale
// is managed here.
//
// Loads its own data (the artwork's detail plus the artist's Settings-
// editable payment methods) when it opens, and renders its
// own full-screen overlay, so the caller only decides when to show it.
// `onChanged` (optional) fires after anything that changes the sale, so
// the caller can refresh whatever else depends on it.
export default function SaleModal({
  target,
  onClose,
  onChanged,
}: {
  target: SaleModalTarget;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const backdrop = useBackdropClose(onClose);

  const [selectedDetail, setSelectedDetail] = useState<ArtworkDetail | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  // The sale's own client type: this window also opens from lists that
  // cover every client, so it sets its own wording (ClientWordsProvider).
  const [clientKind, setClientKind] = useState<ClientKind | null>(null);
  const [loading, setLoading] = useState(true);

  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getArtworkDetailForClient(target.artworkId),
      getArtworkSettings(target.artistId),
    ]).then(([detail, settings]) => {
      if (cancelled) return;
      setSelectedDetail(detail);
      setPaymentMethods(settings.paymentMethods);
      setClientKind(settings.clientKind);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [target.artworkId, target.artistId, target.purchaseId]);

  // Only re-fetches the artwork detail (what actually changes after an
  // action) — Settings-editable lists like paymentMethods don't need
  // refetching on every sale action.
  const refreshSelected = () => {
    getArtworkDetailForClient(target.artworkId).then((detail) => setSelectedDetail(detail));
    onChanged?.();
  };

  // After a delete the sale no longer exists, so close instead.
  const finishAfterDelete = () => {
    onChanged?.();
    onClose();
    router.refresh();
  };

  const handleDeleteSale = (purchase: PurchaseDetail, siteId: string) => {
    setPendingConfirm({
      title: "Delete this sale permanently?",
      message: `This removes the sale entirely — it cannot be undone.${invoiceCancelNote(purchase)}`,
      confirmLabel: "Delete permanently",
      danger: true,
      onConfirm: () => {
        setPendingConfirm(null);
        startTransition(async () => {
          const res = await deleteGallerySale(purchase.id, siteId);
          if (!res.ok) {
            alert(res.error);
            return;
          }
          finishAfterDelete();
        });
      },
    });
  };

  // Deliberately harder-to-reach path for a genuinely completed, paid
  // sale — same reasoning as the matching handler in
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
          finishAfterDelete();
        });
      },
    });
  };

  // The one specific Purchase that was actually asked for — an artwork
  // can have several (an active one plus history), and only one of them
  // is what was clicked. A framing/delivery charge sale (2026-09-23)
  // opens as the sale it belongs to, with the charge shown beneath it.
  const selectedPurchase = selectedDetail
    ? [selectedDetail.activePurchase, ...selectedDetail.purchaseHistory].find(
        (p) => p?.id === target.purchaseId || p?.charges.some((c) => c.id === target.purchaseId)
      ) || null
    : null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdrop}>
        <div className="flex max-h-[90dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
          {loading || !selectedDetail || !clientKind ? (
            <p className="py-8 text-center text-sm text-neutral-400">Loading…</p>
          ) : (
            <ClientWordsProvider kind={clientKind}>
              <div className="shrink-0">
                <SaleHeader
                  artwork={selectedDetail}
                  purchase={selectedPurchase}
                  siteId={target.siteId ?? ""}
                  onChanged={selectedPurchase?.channel === "GALLERY" ? undefined : refreshSelected}
                  onClose={onClose}
                />
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                {!selectedPurchase || !target.siteId ? (
                  <p className="text-sm text-neutral-400">
                    {!target.siteId
                      ? "There's no active site to manage the sale from."
                      : "This sale couldn't be found — it may have changed since the list loaded."}
                  </p>
                ) : selectedPurchase.channel === "GALLERY" ? (
                  <div className="space-y-5">
                    <SaleStatusBadge status={selectedPurchase.status} overdue={selectedPurchase.overdue} />
                    <ConsignedSaleSummary purchase={selectedPurchase} />
                    {selectedPurchase.location ? (
                      <button
                        type="button"
                        onClick={() => {
                          // A cancelled sale opens just its Location; a
                          // live one opens with its sale on screen.
                          const work =
                            selectedPurchase.status === "ABANDONED"
                              ? ""
                              : `&work=${selectedDetail.id}&sale=${target.purchaseId}`;
                          router.push(
                            `/sites/${target.siteId}/galleries?location=${selectedPurchase.location!.customerId}${work}`
                          );
                          onClose();
                        }}
                        className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
                      >
                        Open in location
                      </button>
                    ) : (
                      <p className="text-sm text-neutral-500">This sale isn&apos;t linked to a location.</p>
                    )}
                  </div>
                ) : selectedPurchase.status === "ACTIVE" ? (
                  // An unpaid direct sale from the Studio app.
                  <PurchasePanel
                    siteId={target.siteId}
                    activePurchase={selectedPurchase}
                    history={selectedDetail.purchaseHistory}
                    paymentMethods={paymentMethods}
                    onChanged={refreshSelected}
                  />
                ) : (
                  <SaleDetailCard
                    purchase={selectedPurchase}
                    siteId={target.siteId}
                    artworkType={selectedDetail.type}
                    artworkSize={selectedDetail.size}
                    artworkMedium={selectedDetail.medium}
                    onDelete={
                      selectedPurchase.status !== "COMPLETED"
                        ? () => handleDeleteSale(selectedPurchase, target.siteId!)
                        : undefined
                    }
                    onForceDelete={
                      selectedPurchase.status === "COMPLETED"
                        ? () => handleForceDeleteSale(selectedPurchase.id, target.siteId!)
                        : undefined
                    }
                  />
                )}
              </div>
            </ClientWordsProvider>
          )}
        </div>
      </div>

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
