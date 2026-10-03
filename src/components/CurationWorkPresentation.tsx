"use client";

import { useCallback, useEffect, useState } from "react";
import ArtworkImageManager from "@/components/ArtworkImageManager";
import {
  getCurationWorkPresentation,
  updateCurationWorkDescription,
  type CurationWorkPresentation as Presentation,
} from "@/lib/actions/curations";
import { updateArtworkName, updateArtworkPrice } from "@/lib/actions/artworks";
import { CURRENCIES } from "@/lib/currencies";
import { isValidInstalmentCount, splitIntoInstalments } from "@/lib/saleMath";
import { formatMoney } from "@/lib/studioShared";

// One work's presentation within a curation (2026-10-03) — shown on the
// Curations page beside the works, for whichever work is selected:
// - Images: the artwork's own Main + 3 related images (adding or
//   removing here changes the artwork itself).
// - Name: the artwork's own name (renames it everywhere).
// - Description: this curation's own wording for the work. Until one is
//   written it shows the artwork's Type, Size and Medium, kept current
//   with the Catalogue — see CurationItem.description in schema.prisma.
// - Purchase Options: the artwork's own full price (changes it
//   everywhere), and what it comes to in instalments. The number of
//   instalments is the artist's Settings default, edited there only.
//
// Rendered with a key of curation + work by its parent, so it starts
// fresh whenever a different work is shown.

// The Description as shown: this curation's own once written, otherwise
// the artwork's Type, Size and Medium.
function shownDescription(p: Presentation): string {
  return p.description ?? p.defaultDescription ?? "";
}

export default function CurationWorkPresentation({
  curationId,
  artworkId,
  artistId,
  siteId,
  onArtworkChanged,
}: {
  curationId: string;
  artworkId: string;
  artistId: string;
  siteId: string;
  // Called after anything that changes how the work's tile looks (its
  // name, Main image or price), so the parent can refresh the tiles.
  onArtworkChanged: () => void;
}) {
  const [data, setData] = useState<Presentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [priceDraft, setPriceDraft] = useState("");
  const [currencyDraft, setCurrencyDraft] = useState("GBP");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getCurationWorkPresentation(curationId, artistId, artworkId);
      setData(result);
      if (result) {
        setNameDraft(result.catalogueName);
        setDescriptionDraft(shownDescription(result));
        setPriceDraft(result.offeredPrice ?? "");
        setCurrencyDraft(result.priceCurrency);
      }
    } catch {
      setError("Couldn't load this work's details. Try reloading the page.");
    }
    setLoading(false);
  }, [curationId, artistId, artworkId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-sm text-neutral-400">Loading…</p>;
  if (!data) {
    return (
      <p className="text-sm text-neutral-400">
        {error ?? "This work is no longer in the curation."}
      </p>
    );
  }

  const saveName = async () => {
    if (nameDraft.trim() === data.catalogueName) {
      setNameDraft(data.catalogueName);
      return;
    }
    setError(null);
    setSaving(true);
    const result = await updateArtworkName(artworkId, artistId, nameDraft);
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      setNameDraft(data.catalogueName);
      return;
    }
    setData({ ...data, catalogueName: result.catalogueName });
    setNameDraft(result.catalogueName);
    onArtworkChanged();
  };

  // Saving the default unchanged writes nothing, so a work nobody has
  // written a description for keeps following the Catalogue.
  const saveDescription = async () => {
    if (descriptionDraft.trim() === shownDescription(data).trim()) return;
    setError(null);
    setSaving(true);
    const result = await updateCurationWorkDescription(
      curationId,
      artistId,
      artworkId,
      descriptionDraft
    );
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      setDescriptionDraft(shownDescription(data));
      return;
    }
    setData({ ...data, description: result.description });
    setDescriptionDraft(result.description);
  };

  // Price and currency are saved together — called when the price box
  // loses focus, or straight away when the currency changes.
  const savePrice = async (price: string, currency: string) => {
    const unchanged =
      currency === data.priceCurrency &&
      (price.trim() === ""
        ? data.offeredPrice == null
        : Number(price) === Number(data.offeredPrice));
    if (unchanged) return;
    setError(null);
    setSaving(true);
    const result = await updateArtworkPrice(artworkId, artistId, price, currency);
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      setPriceDraft(data.offeredPrice ?? "");
      setCurrencyDraft(data.priceCurrency);
      return;
    }
    setData({ ...data, offeredPrice: result.offeredPrice, priceCurrency: currency });
    setPriceDraft(result.offeredPrice ?? "");
    onArtworkChanged();
  };

  const price = data.offeredPrice != null ? Number(data.offeredPrice) : null;
  const count = data.defaultInstalmentCount;
  const perInstalment =
    price != null && price > 0 && isValidInstalmentCount(count)
      ? splitIntoInstalments(price, count)[0]
      : null;

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <ArtworkImageManager
        layout="stacked"
        artworkId={artworkId}
        siteId={siteId}
        artistId={artistId}
        images={data.images}
        mainImageId={data.mainImageId}
        onDataChanged={() => {
          load();
          onArtworkChanged();
        }}
      />

      <div className="rounded-xl border border-neutral-300 p-4">
        <h3 className="mb-2 text-center text-lg text-neutral-900">Name</h3>
        <input
          type="text"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-800"
        />
      </div>

      <div className="rounded-xl border border-neutral-300 p-4">
        <h3 className="mb-2 text-center text-lg text-neutral-900">Description</h3>
        <textarea
          value={descriptionDraft}
          onChange={(e) => setDescriptionDraft(e.target.value)}
          onBlur={saveDescription}
          rows={4}
          placeholder="Describe this work for this curation"
          className="w-full resize-y rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-800"
        />
      </div>

      <div className="rounded-xl border border-neutral-300 p-4">
        <h3 className="mb-3 text-center text-lg text-neutral-900">Purchase Options</h3>
        <label className="mb-1 block text-xs font-medium text-neutral-700">Full price</label>
        <div className="flex gap-2">
          <select
            value={currencyDraft}
            onChange={(e) => {
              setCurrencyDraft(e.target.value);
              savePrice(priceDraft, e.target.value);
            }}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            step="0.01"
            value={priceDraft}
            onChange={(e) => setPriceDraft(e.target.value)}
            onBlur={() => savePrice(priceDraft, currencyDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            placeholder="0.00"
            className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>

        {perInstalment != null ? (
          <p className="mt-3 text-sm text-neutral-700">
            or {count} instalments of {formatMoney(perInstalment, data.priceCurrency)}
          </p>
        ) : (
          <p className="mt-3 text-sm text-neutral-400">
            Set a price to show the instalment option.
          </p>
        )}
        <p className="mt-1 text-xs text-neutral-400">
          The number of instalments is set in Settings → Financial → Payments defaults.
        </p>
      </div>

      {saving && <p className="text-xs text-neutral-400">Saving…</p>}
    </div>
  );
}
