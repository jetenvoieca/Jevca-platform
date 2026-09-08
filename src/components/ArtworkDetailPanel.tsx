"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePresentation, updateCatalogue, deleteArtwork, deleteArtworkIfBlank, duplicateArtwork } from "@/lib/actions/artworks";
import { saveSaleTerms } from "@/lib/actions/payments";
import { computeReferencePrice } from "@/lib/pricing";
import ArtworkImageManager from "@/components/ArtworkImageManager";
import PurchasePanel from "@/components/PurchasePanel";
import RecordPastSaleForm from "@/components/RecordPastSaleForm";
import ArtworkCatalogueFields, { withCurrent } from "@/components/ArtworkCatalogueFields";
import type { SaleTermsDetail, PurchaseDetail } from "@/lib/actions/payments";

export type ArtworkDetail = {
  id: string;
  artistId: string;
  catalogueNumber: string;
  presentationTitle: string;
  presentationPrice: string | null;
  description: string | null;
  medium: string | null;
  presentationMedium: string | null;
  viewingLocation: string | null;
  presentationGroup: string | null;
  availability: string;
  visible: boolean;
  catalogueName: string;
  // Free text (e.g. "June 2025"), not a number — see the matching note
  // on Artwork.date in schema.prisma (renamed + retyped from the old
  // numeric `year`, 2026-09-07).
  date: string | null;
  type: string | null;
  catalogueGroup: string | null;
  size: string | null;
  location: string | null;
  edition: string | null;
  availableQty: number | null;
  // Settings-editable list, offered as a dropdown (2026-09-07) — see
  // Artist.artworkTiers in schema.prisma.
  tier: string | null;
  offeredPrice: string | null;
  studioNotes: string | null;
  images: {
    id: string;
    url: string;
    // Larger version for the enlarged preview (2026-08-16) — see the
    // matching note in getArtworkDetailForClient.
    displayUrl: string;
    kind: string;
    posterUrl: string | null;
  }[];
  saleTerms: SaleTermsDetail | null;
  activePurchase: PurchaseDetail | null;
  purchaseHistory: PurchaseDetail[];
};

export type ArtworkSettings = {
  artworkGroups: string[];
  artworkTypes: string[];
  // Full {id, name, refValue} shape (2026-08-28) — used to look up the
  // selected Type's Ref value for the Catalogue tab's live Reference
  // price. artworkTypes above stays around for anywhere that only ever
  // needed the plain name list.
  artworkTypeRecords: { id: string; name: string; refValue: string }[];
  artworkLocations: string[];
  mediumPresets: string[];
  sizePresets: string[];
  // Offered in the Catalogue tab's Tier dropdown (2026-09-07) — see
  // Artist.artworkTiers in schema.prisma.
  artworkTiers: string[];
  saleSources: string[];
  // Offered in GallerySaleCard's "Mark as paid" Method dropdown, via
  // PurchasePanel's Payment tab (2026-09-03) — same Settings-editable
  // list as everywhere else it's used.
  paymentMethods: string[];
  defaultInstalmentCount: number;
  defaultReleaseMessage: string;
  defaultReleaseTriggerCount: number;
};

export default function ArtworkDetailPanel({
  siteId,
  artistId,
  artwork,
  settings,
  siteDefaultCurrency = "GBP",
  onClose,
  onDeleted,
  onDuplicated,
  onDataChanged,
  showCloseButton = true,
}: {
  siteId: string;
  artistId: string;
  artwork: ArtworkDetail;
  settings: ArtworkSettings;
  // Used to default the currency when a new Payment plan is first set up.
  // Optional (falls back to GBP) since not every caller has easy access
  // to the site record — see decisions-log.md.
  siteDefaultCurrency?: string;
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
  // Called after any save in this panel or its Sale Terms / Payment
  // sub-panels (2026-08-11) — replaces relying on router.refresh() alone,
  // which doesn't reach this artwork's data once the parent Catalogue
  // holds it as client state: a fresh server render happens, but the
  // already-mounted `artwork` prop here just keeps its old value, so a
  // saved field (e.g. Catalogue → Group) could appear to silently revert
  // next time this panel re-rendered, even though the save itself worked.
  onDataChanged?: () => void;
  // Off by default only where the panel sits permanently alongside its
  // own list (the Artwork Catalogue) — there, the grid is always visible
  // regardless of whether this panel is open, so an explicit "close"
  // step has nothing left to do (2026-08-15 feedback). Left on
  // everywhere else (e.g. Section editor), where this panel is the only
  // thing showing and closing it is the only way back.
  showCloseButton?: boolean;
}) {
  const [tab, setTab] = useState<"presentation" | "catalogue" | "payment" | "past">("catalogue");
  const [isPending, startTransition] = useTransition();
  const [savedTab, setSavedTab] = useState<null | "presentation" | "catalogue">(null);
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

  // Live state for the "Of" (per-instalment) preview on Presentation
  // (2026-08-28) — Price itself is no longer typed there (it's a
  // read-only mirror of Catalogue's Offered price), so this only needs
  // to react to the Instalments count changing, not a Price field
  // changing too. Calculated, never stored — same convention as
  // Reference price above.
  const [instalmentCountLive, setInstalmentCountLive] = useState(
    artwork.saleTerms?.instalmentCount ?? settings.defaultInstalmentCount
  );
  const instalmentPricePreview = (() => {
    const p = parseFloat(artwork.presentationPrice || "");
    const c = Number(instalmentCountLive);
    if (!p || !c) return "";
    return (p / c).toFixed(2);
  })();

  // ---- Autosave (2026-08-15) — Presentation and Catalogue used to be
  // the only two forms left in this whole app still requiring a manual
  // Save click; everywhere else (Sites, Customers, Galleries…) already
  // autosaves on blur. Bringing these in line also directly answers
  // "can it autosave on leaving the editor": since every field saves the
  // moment it's left, switching to a different artwork never leaves
  // anything unsaved behind — there's no separate "flush on navigate"
  // step needed.
  //
  // Reads straight from the DOM via FormData rather than controlling
  // every field in React state — much less code, and safe here because
  // nothing in either form needs to react to another field's value
  // (unlike Type/Size, which stay their own controlled state for the
  // Reference price preview above).
  const autosavePresentation = (form: HTMLFormElement) => {
    const formData = new FormData(form);
    // Title is required — never autosave it away to blank just because
    // someone selected-all intending to retype and clicked elsewhere
    // first (same guard already used for Site name, etc.).
    if (!(formData.get("presentationTitle") as string)?.trim()) return;
    startTransition(async () => {
      // Sale Terms merged into this tab (2026-08-15) — both save from
      // the same form. saveSaleTerms silently no-ops until a price
      // exists (Catalogue's Offered price, mirrored here) so filling in
      // Instalments before a price is set simply doesn't take effect
      // yet, rather than erroring.
      await Promise.all([
        updatePresentation(artwork.id, siteId, formData),
        saveSaleTerms(artwork.id, siteId, formData),
      ]);
      setSavedTab("presentation");
      if (onDataChanged) onDataChanged();
      else router.refresh();
      setTimeout(() => setSavedTab(null), 1500);
    });
  };

  const autosaveCatalogue = (form: HTMLFormElement) => {
    const formData = new FormData(form);
    if (!(formData.get("catalogueName") as string)?.trim()) return;
    startTransition(async () => {
      await updateCatalogue(artwork.id, siteId, formData);
      setSavedTab("catalogue");
      if (onDataChanged) onDataChanged();
      else router.refresh();
      setTimeout(() => setSavedTab(null), 1500);
    });
  };

  const handleDelete = () => {
    if (!confirm(`Delete "${artwork.presentationTitle}"? This can't be undone.`)) return;
    startTransition(async () => {
      await deleteArtwork(siteId, artwork.id);
      if (onDeleted) {
        onDeleted();
      } else {
        router.push(`/sites/${siteId}/artworks`);
      }
    });
  };

  const handleDuplicate = () => {
    startTransition(async () => {
      const { id: newId } = await duplicateArtwork(artwork.id, siteId);
      if (onDuplicated) onDuplicated(newId);
      else router.push(`/sites/${siteId}/artworks?selected=${newId}`);
    });
  };

  const handleClose = () => {
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

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">{artwork.catalogueName}</h2>
          <p className="text-sm text-neutral-500">
            Catalogue #{artwork.catalogueNumber}
            {artwork.presentationTitle !== artwork.catalogueName && (
              <> · Public title: {artwork.presentationTitle}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDuplicate}
            disabled={isPending}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            Create Derivative
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
          {showCloseButton && (
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              Close
            </button>
          )}
        </div>
      </div>

      <ArtworkImageManager
        artworkId={artwork.id}
        siteId={siteId}
        artistId={artistId}
        images={artwork.images}
        onDataChanged={onDataChanged}
      />


      <div className="mb-6 flex gap-2 border-b border-neutral-200">
        <button
          type="button"
          onClick={() => setTab("catalogue")}
          className={`px-3 py-2 text-sm font-medium ${
            tab === "catalogue"
              ? "border-b-2 border-neutral-900 text-neutral-900"
              : "text-neutral-400 hover:text-neutral-600"
          }`}
        >
          Catalogue
        </button>
        <button
          type="button"
          onClick={() => setTab("presentation")}
          className={`px-3 py-2 text-sm font-medium ${
            tab === "presentation"
              ? "border-b-2 border-neutral-900 text-neutral-900"
              : "text-neutral-400 hover:text-neutral-600"
          }`}
        >
          Presentation
        </button>
        <button
          type="button"
          onClick={() => setTab("payment")}
          className={`px-3 py-2 text-sm font-medium ${
            tab === "payment"
              ? "border-b-2 border-neutral-900 text-neutral-900"
              : "text-neutral-400 hover:text-neutral-600"
          }`}
        >
          Payment
        </button>
        {/* Moved out of the Payment tab's own channel switcher and
            promoted to a top-level tab (2026-08-16) — recording a past
            sale never needed Sale Terms/a Presentation price to exist
            first (it takes its own typed price), but living inside
            Payment made it look and behave as if it did, since the whole
            "Start a sale" block there only renders once terms are set.
            This tab has no such requirement. */}
        <button
          type="button"
          onClick={() => setTab("past")}
          className={`px-3 py-2 text-sm font-medium ${
            tab === "past"
              ? "border-b-2 border-neutral-900 text-neutral-900"
              : "text-neutral-400 hover:text-neutral-600"
          }`}
        >
          Record Past Sale
        </button>
      </div>

      <div>
        {tab === "presentation" ? (
            <>
              <p className="mb-3 text-xs text-neutral-400">
                What customers see on the public site — including price and instalment terms.
                Set this up first, then use the Payment tab to actually take a sale.
              </p>
              <form
                key="presentation-form"
                onBlur={(e) => autosavePresentation(e.currentTarget)}
                className="space-y-4"
              >
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">Title</label>
                  <input
                    type="text"
                    name="presentationTitle"
                    defaultValue={artwork.presentationTitle}
                    required
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Description
                  </label>
                  <textarea
                    name="description"
                    defaultValue={artwork.description || ""}
                    rows={4}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Medium
                  </label>
                  <select
                    name="presentationMedium"
                    defaultValue={artwork.presentationMedium || ""}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  >
                    <option value="">Choose from list…</option>
                    {withCurrent(settings.mediumPresets, artwork.presentationMedium).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Size
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={artwork.size || ""}
                      className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Can be viewed at
                    </label>
                    <input
                      type="text"
                      name="viewingLocation"
                      defaultValue={artwork.viewingLocation || ""}
                      placeholder="e.g. InspireX"
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Price
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={artwork.presentationPrice || ""}
                      className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Instalments
                    </label>
                    <input
                      type="number"
                      name="instalmentCount"
                      min={1}
                      defaultValue={artwork.saleTerms?.instalmentCount ?? settings.defaultInstalmentCount}
                      onChange={(e) => setInstalmentCountLive(parseInt(e.target.value || "0", 10))}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Of
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={instalmentPricePreview || "—"}
                      className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Currency
                    </label>
                    <select
                      name="currency"
                      defaultValue={artwork.saleTerms?.currency ?? siteDefaultCurrency}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    >
                      <option value="GBP">GBP</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {savedTab === "presentation" && (
                    <span className="text-sm text-green-600">Saved</span>
                  )}
                </div>
              </form>
            </>
          ) : tab === "catalogue" ? (
            <>
              <p className="mb-3 text-xs text-neutral-400">
                Your private working record — never shown on the public site.
              </p>

              <form
                key="catalogue-form"
                onBlur={(e) => autosaveCatalogue(e.currentTarget)}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Name
                    </label>
                    <input
                      type="text"
                      name="catalogueName"
                      defaultValue={artwork.catalogueName}
                      required
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Tier
                    </label>
                    <select
                      name="tier"
                      defaultValue={artwork.tier || ""}
                      onChange={(e) => autosaveCatalogue(e.currentTarget.form!)}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    >
                      <option value="">Choose from list…</option>
                      {withCurrent(settings.artworkTiers, artwork.tier).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* The Type/Group/Medium/Size/Edition/Available/
                      Location/Date/Availability/Studio notes block below
                      is the exact same shared component the Hopper's
                      quick-add form uses (ArtworkCatalogueFields,
                      2026-09-07) — Name and Tier above, and Reference/
                      Offered price (passed as children, rendered between
                      Date and Availability) stay Catalogue-tab-only. */}
                  <ArtworkCatalogueFields
                    settings={settings}
                    values={{
                      type: artwork.type || "",
                      catalogueGroup: artwork.catalogueGroup || "",
                      medium: artwork.medium || "",
                      size: artwork.size || "",
                      edition: artwork.edition || "",
                      location: artwork.location || "",
                      availableQty: artwork.availableQty?.toString() ?? "",
                      date: artwork.date || "",
                      studioNotes: artwork.studioNotes || "",
                      availability: artwork.availability,
                    }}
                    onAutosave={autosaveCatalogue}
                    onTypeOrSizeChange={(type, size) => {
                      setTypeValue(type);
                      setSizeValue(size);
                    }}
                  >
                    {/* Reference price is a suggestion, not typed —
                        (Size preset's width × height) × the selected
                        Type's Ref value, recalculated live as either
                        changes (2026-08-28). See src/lib/pricing.ts. */}
                    <div>
                      <label className="mb-1 block text-sm font-medium text-neutral-700">
                        Reference price
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={referencePrice != null ? referencePrice.toFixed(2) : "—"}
                        className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-neutral-700">
                        Offered price
                      </label>
                      <input
                        type="text"
                        name="offeredPrice"
                        defaultValue={artwork.offeredPrice || ""}
                        placeholder="e.g. 450.00"
                        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </ArtworkCatalogueFields>
                </div>
                <div className="flex items-center gap-3">
                  {savedTab === "catalogue" && (
                    <span className="text-sm text-green-600">Saved</span>
                  )}
                </div>
              </form>
            </>
          ) : tab === "payment" ? (
            <PurchasePanel
              artworkId={artwork.id}
              artistId={artistId}
              siteId={siteId}
              terms={artwork.saleTerms}
              activePurchase={artwork.activePurchase}
              history={artwork.purchaseHistory}
              saleSources={settings.saleSources}
              paymentMethods={settings.paymentMethods}
              onChanged={onDataChanged}
            />
          ) : (
            <RecordPastSaleForm
              artworkId={artwork.id}
              artistId={artistId}
              siteId={siteId}
              saleSources={settings.saleSources}
              defaultCurrency={artwork.saleTerms?.currency ?? siteDefaultCurrency}
              onChanged={onDataChanged}
            />
        )}
      </div>
    </div>
  );
}
