"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCatalogue, deleteArtwork, deleteArtworkIfBlank, duplicateArtwork } from "@/lib/actions/artworks";
import { computeReferencePrice } from "@/lib/pricing";
import ArtworkImageManager from "@/components/ArtworkImageManager";
import ArtworkSalePanel from "@/components/ArtworkSalePanel";
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
  // Called after any save in this panel (2026-08-11) — replaces relying
  // on router.refresh() alone, which doesn't reach this artwork's data
  // once the parent Catalogue holds it as client state: a fresh server
  // render happens, but the already-mounted `artwork` prop here just
  // keeps its old value, so a saved field (e.g. Catalogue → Group) could
  // appear to silently revert next time this panel re-rendered, even
  // though the save itself worked.
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

  // ---- The Sold sale panel (2026-09-10, direct request) ----
  // Toggling SOLD (in the Availability control below) opens
  // ArtworkSalePanel, positioned right after Size/Location via
  // ArtworkCatalogueFields' afterLocation slot. Everything below it
  // (Date, Reference/Offered price, the Available/SOLD toggle itself,
  // Studio notes) is hidden entirely while open (hideTail), matching
  // the mockup — "sales panel ends with payment link row". Offered
  // price's value is preserved via its own hidden input alongside the
  // panel, so it survives an unrelated field autosaving while hidden.
  const [saleOpen, setSaleOpen] = useState(artwork.availability === "SOLD");

  // Enter card now (2026-09-10 follow-up) — moves the sale panel up
  // further still, to sit right under Name/Tier, matching the mockup's
  // "slides up further to just under the name/tier row". That means
  // Type/Group/Medium/Size/Location/Edition/Available(qty) disappear
  // too, not just the tail fields hideTail already covers — so when
  // cardMode is on, ArtworkCatalogueFields doesn't render at all, and
  // every field it would have submitted is preserved via the hidden
  // inputs just below it instead.
  const [cardMode, setCardMode] = useState(false);

  // ---- Sale panel field state, owned here (2026-09-10 fix) ----
  // ArtworkSalePanel renders from two structurally different places
  // depending on mode (ArtworkCatalogueFields' afterLocation slot in
  // "sale" mode vs. the cardMode branch that skips ArtworkCatalogueFields
  // entirely in "card" mode) — switching between them mounts a genuinely
  // new component instance, which was silently wiping Deposit paid/
  // Purchase option/Name/Email the moment Enter card now was pressed.
  // Owning the values here and passing them down as controlled props
  // means the same state simply carries over regardless of which branch
  // is currently rendering the panel.
  const [depositPaid, setDepositPaid] = useState("");
  const [datePaid, setDatePaid] = useState("");
  const [purchaseOption, setPurchaseOption] = useState<"full" | "instalments">("full");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");

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

  // Shared props every ArtworkSalePanel instance needs, regardless of
  // which mode/branch is rendering it — keeps the two call sites below
  // from drifting out of sync with each other.
  const salePanelSharedProps = {
    offeredPrice: artwork.offeredPrice,
    currency: artwork.saleTerms?.currency ?? siteDefaultCurrency,
    defaultInstalmentCount: settings.defaultInstalmentCount,
    depositPaid,
    onDepositPaidChange: setDepositPaid,
    datePaid,
    onDatePaidChange: setDatePaid,
    option: purchaseOption,
    onOptionChange: setPurchaseOption,
    buyerName,
    onBuyerNameChange: setBuyerName,
    buyerEmail,
    onBuyerEmailChange: setBuyerEmail,
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

      {/* Tab bar removed (2026-09-10, direct request) — Presentation,
          Payment and Record Past Sale are no longer reachable from this
          panel; only the Catalogue fields show now, permanently, no
          switcher needed. Their functionality isn't deleted from the
          app — PurchasePanel/RecordPastSaleForm are still used exactly
          as before from the Galleries and Sales pages — just not from
          here any more, pending whatever replaces them next. */}
      <p className="mb-3 text-xs text-neutral-400">
        Your private working record — never shown on the public site.
      </p>

      <form key="catalogue-form" onBlur={(e) => autosaveCatalogue(e.currentTarget)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Name</label>
            <input
              type="text"
              name="catalogueName"
              defaultValue={artwork.catalogueName}
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Tier</label>
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

          {cardMode ? (
            // Card entry mode (2026-09-10) — Type through Studio notes
            // don't render at all here; every field ArtworkCatalogueFields
            // would otherwise submit is preserved via hidden inputs below
            // so nothing is lost when Name/Tier next autosaves.
            <>
              <div className="col-span-2">
                <ArtworkSalePanel
                  {...salePanelSharedProps}
                  mode="card"
                  onBackToAvailable={() => {
                    setCardMode(false);
                    setSaleOpen(false);
                  }}
                  onEnterCard={() => {}}
                />
              </div>
              <input type="hidden" name="type" value={artwork.type || ""} />
              <input type="hidden" name="catalogueGroup" value={artwork.catalogueGroup || ""} />
              <input type="hidden" name="medium" value={artwork.medium || ""} />
              <input type="hidden" name="size" value={artwork.size || ""} />
              <input type="hidden" name="edition" value={artwork.edition || ""} />
              <input
                type="hidden"
                name="availableQty"
                value={artwork.availableQty?.toString() ?? ""}
              />
              <input type="hidden" name="location" value={artwork.location || ""} />
              <input type="hidden" name="date" value={artwork.date || ""} />
              <input type="hidden" name="studioNotes" value={artwork.studioNotes || ""} />
              <input type="hidden" name="availability" value={artwork.availability} />
              <input type="hidden" name="offeredPrice" value={artwork.offeredPrice || ""} />
            </>
          ) : (
            /* The Type/Group/Medium/Size/Edition/Available/Location/Date/
               Availability/Studio notes block below is the exact same
               shared component the Hopper's quick-add form uses
               (ArtworkCatalogueFields, 2026-09-07) — Name and Tier above,
               and Reference/Offered price (passed as children, rendered
               between Date and Availability) stay Catalogue-tab-only.
               afterLocation/availabilityOverride/hideTail (2026-09-10)
               slot in the sale panel, the Available/SOLD toggle, and hide
               everything below the panel while it's open. */
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
              hideTail={saleOpen}
              afterLocation={
                saleOpen ? (
                  <>
                    <ArtworkSalePanel
                      {...salePanelSharedProps}
                      mode="sale"
                      onBackToAvailable={() => setSaleOpen(false)}
                      onEnterCard={() => setCardMode(true)}
                    />
                    {/* Offered price's own input is hidden while the panel
                        is open (hideTail hides the Reference/Offered price
                        pair passed as children below) — this preserves its
                        current value so it isn't lost on the next
                        autosave. */}
                    <input type="hidden" name="offeredPrice" value={artwork.offeredPrice || ""} />
                  </>
                ) : null
              }
              availabilityOverride={
                // Available/SOLD toggle (2026-09-10, direct request) —
                // replaces the plain Availability <select>, in the same
                // spot it used to sit. hideTail (above) takes over
                // entirely while saleOpen, so this only actually renders
                // when the panel is closed — reopening it is what SOLD
                // does; closing it is the sale panel's own "Back to
                // Available" link, not this toggle, once open.
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Availability
                  </label>
                  <div className="flex overflow-hidden rounded-md border border-neutral-300 text-sm">
                    <button
                      type="button"
                      onClick={() => setSaleOpen(false)}
                      className={`flex-1 px-3 py-2 font-medium ${
                        !saleOpen
                          ? "bg-neutral-900 text-white"
                          : "bg-white text-neutral-600 hover:bg-neutral-50"
                      }`}
                    >
                      Available
                    </button>
                    <button
                      type="button"
                      onClick={() => setSaleOpen(true)}
                      className={`flex-1 px-3 py-2 font-medium ${
                        saleOpen
                          ? "bg-neutral-900 text-white"
                          : "bg-white text-neutral-600 hover:bg-neutral-50"
                      }`}
                    >
                      SOLD
                    </button>
                  </div>
                  <input type="hidden" name="availability" value={artwork.availability} />
                </div>
              }
            >
              {!saleOpen && (
                <>
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
                </>
              )}
            </ArtworkCatalogueFields>
          )}
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-600">Saved</span>}
        </div>
      </form>
    </div>
  );
}
