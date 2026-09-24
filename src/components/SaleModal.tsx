"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getArtworkDetailForClient } from "@/lib/actions/artworks";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import { deleteGallerySale, forceDeleteCompletedSale } from "@/lib/actions/payments";
import type { ArtworkDetail } from "@/components/ArtworkDetailPanel";
import PurchasePanel from "@/components/PurchasePanel";
import SaleDetailCard from "@/components/SaleDetailCard";
import GallerySaleCard from "@/components/GallerySaleCard";
import SaleHeader from "@/components/SaleHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useBackdropClose } from "@/lib/useBackdropClose";

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
  const [loading, setLoading] = useState(true);
  // Which of the sale and its framing/delivery charges has its panel
  // open (null = the summary) — see GallerySaleCard.
  const [focusedSaleId, setFocusedSaleId] = useState<string | null>(null);

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
      // A charge opened from a list goes straight to its own panel.
      const openedCharge = [detail?.activePurchase, ...(detail?.purchaseHistory ?? [])].some((p) =>
        p?.charges.some((c) => c.id === target.purchaseId)
      );
      setFocusedSaleId(openedCharge ? target.purchaseId : null);
      setPaymentMethods(settings.paymentMethods);
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
          {loading || !selectedDetail ? (
            <p className="py-8 text-center text-sm text-neutral-400">Loading…</p>
          ) : (
            <>
              <div className="shrink-0">
                <SaleHeader
                  artwork={selectedDetail}
                  purchase={selectedPurchase}
                  siteId={target.siteId ?? ""}
                  onChanged={refreshSelected}
                  onClose={onClose}
                  onTitleClick={() => setFocusedSaleId(null)}
                />
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                {!selectedPurchase || !target.siteId ? (
                  <p className="text-sm text-neutral-400">
                    {!target.siteId
                      ? "This artist has no active site to manage the sale from."
                      : "This sale couldn't be found — it may have changed since the list loaded."}
                  </p>
                ) : selectedPurchase.channel === "GALLERY" && selectedPurchase.status !== "ABANDONED" ? (
                  <GallerySaleCard
                    purchase={selectedPurchase}
                    siteId={target.siteId}
                    paymentMethods={paymentMethods}
                    onChanged={refreshSelected}
                    focusedId={focusedSaleId}
                    onFocusChange={setFocusedSaleId}
                  />
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
                        ? () =>
                            handleDeleteSale(
                              selectedPurchase.id,
                              target.siteId!,
                              selectedPurchase.invoiceNumber
                            )
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
            </>
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
