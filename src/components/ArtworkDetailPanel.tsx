"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateCatalogue,
  deleteArtwork,
  deleteArtworkIfBlank,
  duplicateArtwork,
  setArtworkMainImage,
} from "@/lib/actions/artworks";
import type { LocationSummary } from "@/lib/actions/locations";
import { computeReferencePrice } from "@/lib/pricing";
import { CURRENCIES } from "@/lib/currencies";
import MediaPicker from "@/components/MediaPicker";
import ArtworkCatalogueFields from "@/components/ArtworkCatalogueFields";
import type { PurchaseDetail } from "@/lib/actions/payments";

export type ArtworkDetail = {
  id: string;
  artistId: string;
  catalogueNumber: string;
  presentationPrice: string | null;
  description: string | null;
  medium: string | null;
  presentationMedium: string | null;
  viewingLocation: string | null;
  availability: string;
  visible: boolean;
  catalogueName: string;
  // Free text (e.g. "June 2025"), not a number — see the matching note
  // on Artwork.date in schema.prisma (renamed + retyped from the old
  // numeric `year`, 2026-09-07).
  date: string | null;
  type: string | null;
  size: string | null;
  location: string | null;
  edition: string | null;
  availableQty: number | null;
  offeredPrice: string | null;
  // The currency of offeredPrice — see Artwork.priceCurrency.
  priceCurrency: string;
  studioNotes: string | null;
  // "Derived from #..." (2026-09-11) — null for any artwork that isn't
  // itself a "Create Derivative" copy. See the matching note on
  // Artwork.derivedFromId in schema.prisma.
  derivedFromCatalogueNumber: string | null;
  // Which image (if any) is actually Main (2026-09-13) — see the
  // matching note in getArtworkDetailForClient (actions/artworks.ts).
  // The work's one picture (2026-10-28) — `images` holds just it.
  mainImageId: string | null;
  images: {
    id: string;
    url: string;
    // Larger version for the enlarged preview (2026-08-16) — see the
    // matching note in getArtworkDetailForClient.
    displayUrl: string;
    kind: string;
    posterUrl: string | null;
  }[];
  activePurchase: PurchaseDetail | null;
  purchaseHistory: PurchaseDetail[];
};

export type ArtworkSettings = {
  artworkTypes: string[];
  // Full {id, name, refValue} shape (2026-08-28) — used to look up the
  // selected Type's Ref value for the Catalogue tab's live Reference
  // price. artworkTypes above stays around for anywhere that only ever
  // needed the plain name list.
  artworkTypeRecords: { id: string; name: string; refValue: string }[];
  // Real Location model now (2026-09-22, Gallery/Own — see Location in
  // schema.prisma), replacing the old plain-string artworkLocations
  // list. Used by the Location dropdown.
  locations: LocationSummary[];
  mediumPresets: string[];
  sizePresets: string[];
  // The sale-related lists below come with the same settings fetch
  // (getArtworkSettings) and are read by the sale modals and the Studio
  // app, not by this panel.
  saleSources: string[];
  paymentMethods: string[];
  defaultInstalmentCount: number;
};

export default function ArtworkDetailPanel({
  siteId,
  basePath,
  artistId,
  artwork,
  settings,
  onClose,
  onDeleted,
  onDuplicated,
  onDataChanged,
  showCloseButton = true,
}: {
  siteId: string;
  // The site's admin path, or the preview's — where the image "+ Add"
  // tiles lead (defaults to the admin's own).
  basePath?: string;
  artistId: string;
  artwork: ArtworkDetail;
  settings: ArtworkSettings;
  // When provided, Close calls this instead of navigating to the Artworks
  // Catalogue — used when this panel is embedded somewhere else (e.g. the
  // Section editor), where "close" means "go back to what I was doing",
  // not "leave the page".
  onClose?: () => void;
  // Same idea, for Delete (2026-08-11) — when the Catalogue manages
  // selection as client-side state, it needs to remove this artwork from
  // its own list and clear the panel, rather than the old hard redirect
  // deleteArtwork used to do server-side.
  onDeleted?: () => void;
  // Called after Create Derivative successfully creates the new artwork
  // (2026-08-16), with its id — lets the parent Catalogue open it in the
  // panel and refresh the grid, the same way onDeleted lets the parent
  // manage its own list rather than this panel trying to navigate on its
  // behalf.
  onDuplicated?: (newArtworkId: string) => void;
  // Called after any save in this panel (2026-08-11) — replaces relying
  // on router.refresh() alone, which doesn't reach this artwork's data
  // once the parent Catalogue holds it as client state: a fresh server
  // render happens, but the already-mounted `artwork` prop here just
  // keeps its old value, so a saved field could appear to silently
  // revert next time this panel re-rendered, even though the save
  // itself worked.
  onDataChanged?: () => void;
  // Off by default only where the panel sits permanently alongside its
  // own list (the Artwork Catalogue) — there, the grid is always visible
  // regardless of whether this panel is open, so an explicit "close"
  // step has nothing left to do (2026-08-15 feedback). Left on
  // everywhere else (e.g. Section editor), where this panel is the only
  // thing showing and closing it is the only way back.
  showCloseButton?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  // Live state for Type/Size (2026-08-28) — needed for the Reference
  // price preview below. Owned here (rather than inside
  // ArtworkCatalogueFields) since Reference price is Catalogue-tab-only;
  // kept in sync via that component's onTypeOrSizeChange.
  const [typeValue, setTypeValue] = useState(artwork.type || "");
  const router = useRouter();

  // Live state for Size (2026-08-28) — needed alongside typeValue to
  // compute the Reference price preview below as either one changes,
  // same "tracked live, not just at load" reasoning as Type above.
  const [sizeValue, setSizeValue] = useState(artwork.size || "");
  const selectedTypeRecord = settings.artworkTypeRecords.find(
    (t) => t.name.toLowerCase() === typeValue.trim().toLowerCase()
  );
  const referencePrice = computeReferencePrice(
    sizeValue,
    selectedTypeRecord ? parseFloat(selectedTypeRecord.refValue) : null
  );

  // While the Location is a Gallery the price is the one agreed with that
  // gallery, so it is labelled "Consigned price"; anywhere else it is the
  // "Offered price". Same one field either way (see
  // Artwork.priceCurrency). Tracked live so the label follows the
  // Location dropdown, including a Location just added from it.
  const [locationValue, setLocationValue] = useState(artwork.location || "");
  // Every Location by name — its type for the price label, and its
  // record for the Location's View button (2026-10-15, Craig's mockup:
  // opens the work in its Location).
  const [locationsByName, setLocationsByName] = useState(
    () => new Map(settings.locations.map((l) => [l.name, l]))
  );
  const currentLocation = locationsByName.get(locationValue) ?? null;
  const atGallery = currentLocation?.type === "GALLERY";
  const viewInLocation = (location: LocationSummary) =>
    router.push(`/sites/${siteId}/galleries?location=${location.customerId}&work=${artwork.id}`);
  const priceLabel = atGallery ? "Consigned price" : "Offered price";

  // The artwork's sale, once it has one (2026-10-14, Craig's mockup):
  // the catalogue has no Available/SOLD control any more — an artwork
  // with no sale is available as a matter of course, and a sale is
  // recorded at the artwork's Location. Once sold (or, for a Studio
  // sale, "Sold - Not Paid"), a SOLD button by the price opens that sale
  // in its Location (a sale with no Location: the Sales page).
  const sale =
    artwork.availability === "SOLD" || artwork.availability === "RESERVED"
      ? (artwork.activePurchase ??
        artwork.purchaseHistory.find((p) => p.status === "COMPLETED") ??
        null)
      : null;
  const openSale = () => {
    if (!sale?.location) {
      router.push(`/sites/${siteId}/sales`);
      return;
    }
    router.push(
      `/sites/${siteId}/galleries?location=${sale.location.customerId}&work=${artwork.id}&sale=${sale.id}`
    );
  };

  // ---- Autosave (2026-08-15) — reads straight from the DOM via
  // FormData rather than controlling every field in React state - much
  // less code, and safe here because nothing in this form needs to
  // react to another field's value (unlike Type/Size, which stay their
  // own controlled state for the Reference price preview above).
  const autosaveCatalogue = (form: HTMLFormElement) => {
    const formData = new FormData(form);
    if (!(formData.get("catalogueName") as string)?.trim()) return;
    startTransition(async () => {
      await updateCatalogue(artwork.id, siteId, formData);
      setSaved(true);
      if (onDataChanged) onDataChanged();
      else router.refresh();
      setTimeout(() => setSaved(false), 1500);
    });
  };

  const handleDelete = () => {
    if (!confirm(`Delete "${artwork.catalogueName}"? This can't be undone.`)) return;
    startTransition(async () => {
      await deleteArtwork(siteId, artwork.id);
      if (onDeleted) {
        onDeleted();
      } else {
        router.push(`/sites/${siteId}/artworks`);
      }
    });
  };

  // Same Type checks duplicateArtwork itself uses server-side (2026-09-11)
  // — computed here too so this can decide, before calling the action at
  // all, whether a new edition number needs asking for. Original/Unique
  // never asks (everything's blank on the new derivative anyway); an
  // edition-type source does, since a new print copy needs its own
  // edition number, not the original's.
  // The work's one picture (2026-10-28); changing it refreshes the work.
  const mainImage = artwork.images.find((i) => i.id === artwork.mainImageId) ?? artwork.images[0] ?? null;
  const [pictureError, setPictureError] = useState<string | null>(null);
  const changeMainImage = (imageId: string) => {
    setPictureError(null);
    startTransition(async () => {
      const result = await setArtworkMainImage(artwork.id, imageId);
      if ("error" in result) setPictureError(result.error);
      else onDataChanged?.();
    });
  };

  const handleDuplicate = () => {
    const typeLower = (artwork.type || "").trim().toLowerCase();
    const isOriginalOrUnique = typeLower.includes("original") || typeLower.includes("unique");
    const isEditionType = typeLower.includes("edition");

    let newEdition: string | null = null;
    if (!isOriginalOrUnique && isEditionType) {
      // Cancelling this prompt doesn't cancel the derivative itself —
      // it just falls back to copying the original's own edition number
      // (duplicateArtwork's default when newEdition is empty), same as
      // every other field on an edition-type derivative.
      newEdition = window.prompt("Edition number for this derivative (e.g. 6/25):");
    }

    startTransition(async () => {
      const { id: newId } = await duplicateArtwork(artwork.id, siteId, newEdition);
      if (onDuplicated) onDuplicated(newId);
      else router.push(`/sites/${siteId}/artworks?selected=${newId}`);
    });
  };

  const handleClosePanel = () => {
    startTransition(async () => {
      // Quietly removes this record if it's still exactly as it was when
      // created (see deleteArtworkIfBlank) — a no-op if you've actually
      // added anything, so this never touches real data.
      await deleteArtworkIfBlank(siteId, artwork.id);
      if (onClose) {
        onClose();
      } else {
        router.push(`/sites/${siteId}/artworks`);
      }
    });
  };

  // ---- Inline "add new preset" (2026-09-11, direct request — "all
  // drop-downs add ability to add to lists") — each just persists the
  // new value to the artist's own Settings list (Type has its own table
  // with a Ref value, hence its own action; Medium is a plain string
  // list via addSettingOption) and fires-and-forgets;
  // ArtworkCatalogueFields already updates its own local state so the
  // new value shows as selected immediately, and autosaves it onto this
  // artwork right after. No router.refresh() needed here specifically
  // for that to work — the next full load of Settings/this page simply
  // picks up the new preset from then on.
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-6">
      {/* Sticky header (2026-09-10, direct request) — was scrolling away
          with the rest of the panel's content inside the modal's own
          overflow-y-auto. The negative margins cancel this wrapper's own
          p-6 so the sticky bar can run edge-to-edge against the modal
          while stuck, then its own px-6/py-* reinstates the same
          padding the content below still has, so nothing visually
          shifts. */}
      <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-4 flex items-start justify-between border-b border-neutral-200 bg-white px-6 pb-4 pt-6">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">{artwork.catalogueName}</h2>
          <p className="text-sm text-neutral-500">Catalogue #{artwork.catalogueNumber}</p>
          {/* "Derived from #..." (2026-09-11, direct request — "show
              which artwork the current work is derived from") — replaces
              the word "Derivative" ever appearing in the title/name
              (see the Name field and duplicateArtwork) with an explicit,
              clickable-in-future reference to the actual source
              artwork's catalogue number instead. */}
          {artwork.derivedFromCatalogueNumber && (
            <p className="text-sm text-neutral-500">
              Derived from #{artwork.derivedFromCatalogueNumber}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDuplicate}
            disabled={isPending}
            className="rounded-md border border-neutral-300 px-3 py-[4.8px] text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {/* Shortened from "Create Derivative" (2026-09-10, direct
                request). Button heights cut ~20% throughout this
                header/form (2026-09-11, direct request — "catalogue
                will be a high usage area") via arbitrary py values, same
                reasoning as ArtworkCatalogueFields' shared inputCls. */}
            Derivative
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-md border border-red-200 px-3 py-[4.8px] text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
          {showCloseButton && (
            // X icon instead of the word "Close" (2026-09-11, direct
            // request) — same handleClosePanel behaviour, just an icon
            // button now.
            <button
              type="button"
              onClick={handleClosePanel}
              disabled={isPending}
              aria-label="Close"
              className="rounded-md border border-neutral-300 p-[4.8px] text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <form onBlur={(e) => autosaveCatalogue(e.currentTarget)} className="space-y-4">
          <ArtworkCatalogueFields
            name={
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Name</label>
                <input
                  type="text"
                  name="catalogueName"
                  defaultValue={artwork.catalogueName}
                  required
                  className="w-full rounded-md border border-neutral-300 px-3 py-[6.4px] text-sm"
                />
              </div>
            }
            picture={
              // The work's one picture (2026-10-28): click it to choose
              // another from the Media Catalogue.
              <div className="relative">
                <MediaPicker
                  artistId={artistId}
                  siteId={siteId}
                  mode="single"
                  mediaKinds={["PHOTO"]}
                  label="Add a picture"
                  previewUrl={mainImage?.displayUrl}
                  previewClassName="aspect-square"
                  onSelect={(images) => {
                    if (images[0]) changeMainImage(images[0].id);
                  }}
                />
                {mainImage && (
                  <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                    Main
                  </span>
                )}
                {pictureError && <p className="mt-1 text-xs text-red-600">{pictureError}</p>}
              </div>
            }
            settings={settings}
            values={{
              type: artwork.type || "",
              medium: artwork.medium || "",
              size: artwork.size || "",
              edition: artwork.edition || "",
              location: artwork.location || "",
              availableQty: artwork.availableQty?.toString() ?? "",
              date: artwork.date || "",
              studioNotes: artwork.studioNotes || "",
            }}
            onAutosave={autosaveCatalogue}
            onTypeOrSizeChange={(type, size) => {
              setTypeValue(type);
              setSizeValue(size);
            }}
            onLocationChange={setLocationValue}
            onViewLocation={currentLocation ? () => viewInLocation(currentLocation) : undefined}
            artistId={artistId}
            siteId={siteId}
            onLocationAdded={(location) => setLocationsByName((prev) => new Map(prev).set(location.name, location))}
          >
            {/* Reference and Offered price as one compact pair
                (2026-09-11, direct request — "put reference price
                and offered price in same column for direct
                comparison"): a single child of ArtworkCatalogueFields,
                so together they take one outer grid cell, with their
                own tight 2-column sub-grid inside. */}
            {/* Reference price kept narrow (2026-10-14, Craig: up to five
                figures, whole pounds/euros) so the price has room. */}
            <div className={`grid gap-2 ${sale ? "grid-cols-[5rem_1fr_auto]" : "grid-cols-[5rem_1fr]"}`}>
              {/* Reference price is a suggestion, not typed —
                  (Size preset's width × height) × the selected
                  Type's Ref value, recalculated live as either
                  changes (2026-08-28). See src/lib/pricing.ts. */}
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Ref. price
                </label>
                <input
                  type="text"
                  readOnly
                  value={referencePrice != null ? Math.round(referencePrice).toString() : "—"}
                  className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-[6.4px] text-sm text-neutral-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  {priceLabel}
                </label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    name="offeredPrice"
                    defaultValue={artwork.offeredPrice || ""}
                    placeholder="e.g. 450.00"
                    className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-[6.4px] text-sm"
                  />
                  <select
                    name="priceCurrency"
                    aria-label="Currency"
                    defaultValue={artwork.priceCurrency}
                    onChange={(e) => autosaveCatalogue(e.currentTarget.form!)}
                    className="shrink-0 rounded-md border border-neutral-300 px-1 py-[6.4px] text-sm"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {sale && (
                <div>
                  {/* An empty label keeps the button level with the
                      price boxes. */}
                  <label className="mb-1 block text-sm font-medium text-neutral-700" aria-hidden>
                    &nbsp;
                  </label>
                  <button
                    type="button"
                    onClick={openSale}
                    title={artwork.availability === "RESERVED" ? "Sold - Not Paid — open the sale" : "Open the sale"}
                    className="rounded-md border border-neutral-300 px-4 py-[6.4px] text-sm font-medium text-neutral-900 hover:bg-neutral-50"
                  >
                    SOLD
                  </button>
                </div>
              )}
            </div>
          </ArtworkCatalogueFields>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-600">Saved</span>}
        </div>
      </form>
    </div>
  );
}
