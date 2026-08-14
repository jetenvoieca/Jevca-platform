"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updatePresentation,
  updateCatalogue,
  deleteArtwork,
  deleteArtworkIfBlank,
  linkImagesToArtwork,
  unlinkImageFromArtwork,
} from "@/lib/actions/artworks";
import MediaPicker from "@/components/MediaPicker";
import SaleTermsPanel from "@/components/SaleTermsPanel";
import PurchasePanel from "@/components/PurchasePanel";
import type { SaleTermsDetail, PurchaseDetail } from "@/lib/actions/payments";

export type ArtworkDetail = {
  id: string;
  artistId: string;
  catalogueNumber: string;
  presentationTitle: string;
  presentationPrice: string | null;
  dimensions: string | null;
  description: string | null;
  medium: string | null;
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
  priceUnframed: string | null;
  priceFramed: string | null;
  studioNotes: string | null;
  images: { id: string; url: string; kind: string; posterUrl: string | null }[];
  saleTerms: SaleTermsDetail | null;
  activePurchase: PurchaseDetail | null;
  purchaseHistory: PurchaseDetail[];
};

export type ArtworkSettings = {
  artworkGroups: string[];
  artworkTypes: string[];
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
  onDataChanged,
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
  // Called after any save in this panel or its Sale Terms / Payment
  // sub-panels (2026-08-11) — replaces relying on router.refresh() alone,
  // which doesn't reach this artwork's data once the parent Catalogue
  // holds it as client state: a fresh server render happens, but the
  // already-mounted `artwork` prop here just keeps its old value, so a
  // saved field (e.g. Catalogue → Group) could appear to silently revert
  // next time this panel re-rendered, even though the save itself worked.
  onDataChanged?: () => void;
}) {
  const [tab, setTab] = useState<"presentation" | "catalogue" | "saleterms" | "payment">(
    "catalogue"
  );
  const [images, setImages] = useState(artwork.images);
  const [isPending, startTransition] = useTransition();
  const [savedTab, setSavedTab] = useState<null | "presentation" | "catalogue">(null);
  // Original/Unique pieces don't have editions or framed-vs-unframed
  // pricing the way prints do — Catalogue shows a simpler set of fields
  // for them. Tracked live (not just at load) so switching Type updates
  // the form immediately, without needing to save and reopen.
  const [typeValue, setTypeValue] = useState(artwork.type || "");
  const isUniqueType = ["original", "unique"].includes(typeValue.trim().toLowerCase());
  // Substring rather than exact match (2026-08-15) — Type is free text
  // from the artist's own preset list and can be phrased several ways
  // ("Edition", "Giclée Edition", "Limited Edition"; "Aluminium",
  // "Print on Aluminium"), not necessarily the bare word alone.
  const isEditionType = typeValue.trim().toLowerCase().includes("edition");
  const isAluminiumType = typeValue.trim().toLowerCase().includes("aluminium");
  const router = useRouter();

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
  // (unlike Type, which stays its own controlled state for the
  // conditional fields below).
  const autosavePresentation = (form: HTMLFormElement) => {
    const formData = new FormData(form);
    // Title is required — never autosave it away to blank just because
    // someone selected-all intending to retype and clicked elsewhere
    // first (same guard already used for Site name, etc.).
    if (!(formData.get("presentationTitle") as string)?.trim()) return;
    startTransition(async () => {
      await updatePresentation(artwork.id, siteId, formData);
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
          <h2 className="text-xl font-semibold text-neutral-900">{artwork.presentationTitle}</h2>
          <p className="text-sm text-neutral-500">Catalogue #{artwork.catalogueNumber}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="mb-2 text-sm font-medium text-neutral-700">Related Images</h3>
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div key={img.id} className="group relative h-20 w-20">
              {img.kind === "VIDEO" ? (
                img.posterUrl ? (
                  <img
                    src={img.posterUrl}
                    alt=""
                    className="h-20 w-20 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded bg-neutral-200 text-[10px] text-neutral-500">
                    Video
                  </div>
                )
              ) : (
                <img src={img.url} alt="" className="h-20 w-20 rounded object-cover" />
              )}
              <button
                type="button"
                onClick={() => {
                  startTransition(async () => {
                    await unlinkImageFromArtwork(artwork.id, img.id, siteId);
                    setImages((prev) => prev.filter((i) => i.id !== img.id));
                  });
                }}
                className="absolute right-0 top-0 hidden rounded-bl bg-black/60 px-1 text-xs text-white group-hover:block"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="h-20 w-20">
            <MediaPicker
              artistId={artistId}
              mode="multi"
              label="Add"
              linkedArtworkId={artwork.id}
              mediaKinds={["PHOTO", "VIDEO"]}
              onSelect={(imgs) => {
                const ids = imgs.map((i) => i.id);
                startTransition(async () => {
                  await linkImagesToArtwork(artwork.id, ids, siteId);
                  setImages((prev) => [
                    ...prev,
                    ...imgs
                      .filter((img) => !prev.some((p) => p.id === img.id))
                      .map((img) => ({
                        id: img.id,
                        url: img.url,
                        kind: img.kind,
                        posterUrl: img.posterUrl,
                      })),
                  ]);
                });
              }}
            />
          </div>
        </div>
      </div>

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
          onClick={() => setTab("saleterms")}
          className={`px-3 py-2 text-sm font-medium ${
            tab === "saleterms"
              ? "border-b-2 border-neutral-900 text-neutral-900"
              : "text-neutral-400 hover:text-neutral-600"
          }`}
        >
          Sale Terms
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
      </div>

      <div>
        {tab === "presentation" ? (
            <>
              <p className="mb-3 text-xs text-neutral-400">
                What customers see on the public site.
              </p>
              <form
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Price (£)
                    </label>
                    <input
                      type="text"
                      name="presentationPrice"
                      defaultValue={artwork.presentationPrice || ""}
                      placeholder="e.g. 450.00"
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Dimensions
                    </label>
                    <input
                      type="text"
                      name="dimensions"
                      defaultValue={artwork.dimensions || ""}
                      placeholder="e.g. 100 x 100 cm"
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
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
                    Medium{" "}
                    <span className="font-normal text-neutral-400">(from Catalogue)</span>
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={artwork.medium || ""}
                    className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Group <span className="font-normal text-neutral-400">(from Catalogue)</span>
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={artwork.catalogueGroup || ""}
                    className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                  />
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
                      defaultValue={artwork.size || ""}
                      onChange={(e) => autosaveCatalogue(e.currentTarget.form!)}
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
                  {/* Edition/Available (qty) only apply to editioned work
                      — Originals, Uniques, and materials like Aluminium
                      that aren't editioned are one-offs (2026-08-15
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
                    <>
                      {/* Preserve any Edition/Available values already on
                          record rather than wiping them out just because
                          Type changed — they'll reappear if switched back. */}
                      <input type="hidden" name="edition" value={artwork.edition || ""} />
                      <input
                        type="hidden"
                        name="availableQty"
                        value={artwork.availableQty ?? ""}
                      />
                    </>
                  )}
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
                  {isUniqueType ? (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-neutral-700">
                        Price (£)
                      </label>
                      <input
                        type="text"
                        name="priceUnframed"
                        defaultValue={artwork.priceUnframed || ""}
                        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </div>
                  ) : isAluminiumType ? (
                    // Aluminium prints aren't offered framed at all
                    // (2026-08-15) — same single-price treatment as
                    // Originals/Uniques, for a different reason.
                    <div>
                      <label className="mb-1 block text-sm font-medium text-neutral-700">
                        Price (£)
                      </label>
                      <input
                        type="text"
                        name="priceUnframed"
                        defaultValue={artwork.priceUnframed || ""}
                        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-neutral-700">
                        Price unframed (£)
                      </label>
                      <input
                        type="text"
                        name="priceUnframed"
                        defaultValue={artwork.priceUnframed || ""}
                        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                  {isUniqueType || isAluminiumType ? (
                    // Preserve an existing framed price rather than wiping
                    // it out just because Type changed — reappears if
                    // switched to a type that does offer framing.
                    <input type="hidden" name="priceFramed" value={artwork.priceFramed || ""} />
                  ) : (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-neutral-700">
                        Price framed (£)
                      </label>
                      <input
                        type="text"
                        name="priceFramed"
                        defaultValue={artwork.priceFramed || ""}
                        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </div>
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
          ) : tab === "saleterms" ? (
            <SaleTermsPanel
              artworkId={artwork.id}
              siteId={siteId}
              siteDefaultCurrency={siteDefaultCurrency}
              terms={artwork.saleTerms}
              presentationPrice={artwork.presentationPrice}
              defaults={{
                defaultInstalmentCount: settings.defaultInstalmentCount,
                defaultReleaseMessage: settings.defaultReleaseMessage,
                defaultReleaseTriggerCount: settings.defaultReleaseTriggerCount,
              }}
              onDataChanged={onDataChanged}
            />
          ) : (
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
        )}
      </div>
    </div>
  );
}
