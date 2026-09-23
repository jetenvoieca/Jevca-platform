"use client";

import type { ArtworkDetail } from "@/components/ArtworkDetailPanel";
import type { PurchaseDetail } from "@/lib/actions/payments";
import { formatDate } from "@/lib/formatDate";
import EditSaleButton from "@/components/EditSaleButton";

// The one header used by every sale modal (Locations page, Sales page,
// Consolidated Sales, Inbox): artwork image, title, catalogue number,
// type, size and — once a sale is recorded — its sold date, with
// Edit/Close top right. `purchase` is null on the blank Record Sale
// form, which hides the Sold line and the Edit button (as does an
// abandoned sale).
//
// `onTitleClick` (optional) makes the image and details clickable — the
// sale card uses it to return from one sale's panel to the summary of
// the sale and its framing/delivery charges (see GallerySaleCard).
export default function SaleHeader({
  artwork,
  purchase,
  siteId,
  onChanged,
  onClose,
  onTitleClick,
}: {
  artwork: ArtworkDetail;
  purchase: PurchaseDetail | null;
  siteId: string;
  onChanged: () => void;
  onClose: () => void;
  onTitleClick?: () => void;
}) {
  const mainImage =
    artwork.images.find((i) => i.id === artwork.mainImageId) ?? artwork.images[0] ?? null;
  const thumbUrl = mainImage
    ? mainImage.kind === "VIDEO"
      ? mainImage.posterUrl
      : mainImage.url
    : null;

  const typeLine = [artwork.type, artwork.edition].filter(Boolean).join(" - ");

  return (
    <div className="flex items-start gap-4 border-b border-neutral-200 px-5 py-4">
      <div
        onClick={onTitleClick}
        className={`flex min-w-0 flex-1 items-start gap-4 ${onTitleClick ? "cursor-pointer" : ""}`}
      >
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt="" className="h-24 w-24 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="h-24 w-24 shrink-0 rounded-md bg-neutral-100" />
        )}

        <div className="min-w-0 flex-1 text-xs leading-5 text-neutral-400">
          <p className="truncate text-base font-medium leading-6 text-neutral-900">
            {artwork.presentationTitle}
          </p>
          <p>Catalogue #{artwork.catalogueNumber}</p>
          {typeLine && <p>{typeLine}</p>}
          {artwork.size && <p>Size: {artwork.size}</p>}
          {purchase && purchase.status !== "ABANDONED" && (
            <p>Sold {formatDate(purchase.createdAt)}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <EditSaleButton purchase={purchase} siteId={siteId} onChanged={onChanged} />
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}
