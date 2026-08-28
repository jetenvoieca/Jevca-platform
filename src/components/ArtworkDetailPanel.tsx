"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePresentation, updateCatalogue, deleteArtwork, deleteArtworkIfBlank, duplicateArtwork } from "@/lib/actions/artworks";
import { saveSaleTerms } from "@/lib/actions/payments";
import { computeReferencePrice } from "@/lib/pricing";
import ArtworkImageManager from "@/components/ArtworkImageManager";
import PurchasePanel from "@/components/PurchasePanel";
import RecordPastSaleForm from "@/components/RecordPastSaleForm";
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
  year: number | null;
  type: string | null;
  catalogueGroup: string | null;
  size: string | null;
  location: string | null;
  edition: string | null;
  availableQty: number | null;
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
  saleSources: string[];
  defaultInstalmentCount: number;
  defaultReleaseMessage: string;
  defaultReleaseTriggerCount: number;
};

// Keeps a select from silently dropping an existing value that isn't (yet)
// in the preset list — e.g. legacy data typed in before Settings existed.
function withCurrent(presets: string[], current: string | null) {
  if (!current || presets.includes(current)) return presets;
  return [current, ...presets];
}

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
  // Original/Unique pieces don't have editions the way prints do —
  // Catalogue shows a simpler set of fields for them. Tracked live (not
  // just at load) so switching Type updates the form immediately,
  // without needing to save and reopen.
  const [typeValue, setTypeValue] = useState(artwork.type || "");
  // Substring rather than exact match (2026-08-15) — Type is free text
  // from the artist's own preset list and can be phrased several ways
  // ("Edition", "Giclée Edition", "Limited Edition").
  const isEditionType = typeValue.trim().toLowerCase().includes("edition");
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Size <span className="font-normal text-neutral-400">(from Catalogue)</span>
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

                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Price <span className="font-normal text-neutral-400">(from Catalogue)</span>
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
                      Year
                    </label>
                    <input
                      type="number"
                      name="year"
                      defaultValue={artwork.year ?? ""}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Type
                    </label>
                    <select
                      name="type"
                      value={typeValue}
                      onChange={(e) => {
                        setTypeValue(e.target.value);
                        autosaveCatalogue(e.currentTarget.form!);
                      }}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    >
                      <option value="">Choose from list…</option>
                      {withCurrent(settings.artworkTypes, artwork.type).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Group
                    </label>
                    <select
                      name="catalogueGroup"
                      defaultValue={artwork.catalogueGroup || ""}
                      onChange={(e) => autosaveCatalogue(e.currentTarget.form!)}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    >
                      <option value="">Choose from list…</option>
                      {withCurrent(settings.artworkGroups, artwork.catalogueGroup).map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Medium
                    </label>
                    <select
                      name="medium"
                      defaultValue={artwork.medium || ""}
                      onChange={(e) => autosaveCatalogue(e.currentTarget.form!)}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    >
                      <option value="">Choose from list…</option>
                      {withCurrent(settings.mediumPresets, artwork.medium).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Size
                    </label>
                    <select
                      name="size"
                      value={sizeValue}
                      onChange={(e) => {
                        setSizeValue(e.target.value);
                        autosaveCatalogue(e.currentTarget.form!);
                      }}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    >
                      <option value="">Choose from list…</option>
                      {withCurrent(settings.sizePresets, artwork.size).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* Edition only applies to editioned work — Originals
                      and Uniques (and materials like Aluminium that
                      aren't editioned) are one-offs (2026-08-15
                      decision). Positive match on "is this an edition"
                      rather than the old "isn't unique", since a type
                      like Aluminium is neither. */}
                  {isEditionType && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-neutral-700">
                        Edition
                      </label>
                      <input
                        type="text"
                        name="edition"
                        defaultValue={artwork.edition || ""}
                        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                  {!isEditionType && (
                    // Preserve any Edition value already on record rather
                    // than wiping it out just because Type changed — it'll
                    // reappear if switched back.
                    <input type="hidden" name="edition" value={artwork.edition || ""} />
                  )}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Location
                    </label>
                    <select
                      name="location"
                      defaultValue={artwork.location || ""}
                      onChange={(e) => autosaveCatalogue(e.currentTarget.form!)}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    >
                      <option value="">Choose from list…</option>
                      {withCurrent(settings.artworkLocations, artwork.location).map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isEditionType && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-neutral-700">
                        Available (qty)
                      </label>
                      <input
                        type="number"
                        name="availableQty"
                        defaultValue={artwork.availableQty ?? ""}
                        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                  {!isEditionType && (
                    <input
                      type="hidden"
                      name="availableQty"
                      value={artwork.availableQty ?? ""}
                    />
                  )}
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
                  {!isEditionType ? (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-neutral-700">
                        Availability
                      </label>
                      <select
                        name="availability"
                        defaultValue={artwork.availability}
                        onChange={(e) => autosaveCatalogue(e.currentTarget.form!)}
                        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                      >
                        <option value="AVAILABLE">Available</option>
                        <option value="RESERVED">Reserved</option>
                        <option value="SOLD">Sold</option>
                      </select>
                    </div>
                  ) : (
                    // Editions track availability via the numeric Available
                    // (qty) field instead — this status only makes sense
                    // for a one-of-a-kind piece. Required/non-nullable in
                    // the database, so preserved via hidden input rather
                    // than left out of the submitted form.
                    <input type="hidden" name="availability" value={artwork.availability} />
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Studio notes <span className="font-normal text-neutral-400">(private)</span>
                  </label>
                  <textarea
                    name="studioNotes"
                    defaultValue={artwork.studioNotes || ""}
                    rows={3}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
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
