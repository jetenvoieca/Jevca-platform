"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ImageSetEditor from "@/components/ImageSetEditor";
import { useClientWords } from "@/components/ClientWordsProvider";
import {
  artistAppDefaultCurrency,
  createArtistAppWork,
  describeArtistAppImages,
} from "@/lib/actions/artistApp";
import type { ArtworkImage } from "@/lib/artworkImages";
import { CURRENCIES } from "@/lib/currencies";
import { ARTIST_APP_PICTURES_FROM_FILE } from "@/lib/artistApp";

// "Add new work" (2026-11-09, Craig's mockup): a curation's Presentation
// for a work that doesn't exist yet — pictures, Name, Description (larger)
// and Full price (online sales come later). Nothing is saved until Add
// work: then it's a new Catalogue entry, on the end of the page's
// curation (createArtistAppWork). Over the artwork picker it's opened
// from — same layer as the picker and the media picker, so whichever
// opened last is on top.

const PANEL = "rounded-xl border border-neutral-300 px-3.5 py-2.5";
const PANEL_TITLE = "mb-1 text-center text-base text-neutral-900";

export default function ArtistNewWorkModal({
  siteId,
  artistId,
  curationId,
  onClose,
  onAdded,
}: {
  siteId: string;
  artistId: string;
  curationId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const words = useClientWords();
  const item = words.item.toLowerCase();
  const [images, setImages] = useState<ArtworkImage[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    artistAppDefaultCurrency(siteId)
      .then(setCurrency)
      .catch(() => setCurrency(CURRENCIES[0]));
  }, [siteId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const add = async () => {
    if (saving || !currency) return;
    if (!name.trim()) return setError(`Give the ${item} a name.`);
    setSaving(true);
    setError(null);
    const result = await createArtistAppWork(siteId, curationId, {
      name,
      description,
      price,
      currency,
      imageIds: images.map((i) => i.id),
    }).catch(() => ({ error: `The ${item} wasn't added — please try again.` }));
    setSaving(false);
    if ("error" in result) return setError(result.error);
    onAdded();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-full w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-2.5">
          <h2 className="min-w-0 flex-1 truncate text-lg text-neutral-900">Add new {item}</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
          <div className="grid items-start gap-4 md:grid-cols-[4fr_5fr]">
            <ImageSetEditor
              artistId={artistId}
              siteId={siteId}
              images={images}
              save={(ids) => describeArtistAppImages(siteId, ids)}
              onSaved={(next) => {
                setError(null);
                setImages(next);
              }}
              onError={setError}
              addFrom={ARTIST_APP_PICTURES_FROM_FILE ? "file" : "catalogue"}
            />

            <div className="flex flex-col gap-2.5">
              <div className={PANEL}>
                <h3 className={PANEL_TITLE}>Name</h3>
                <input
                  type="text"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-800"
                />
              </div>

              <div className={PANEL}>
                <h3 className={PANEL_TITLE}>Description</h3>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={9}
                  className="w-full resize-y rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-800"
                />
              </div>

              <div className={PANEL}>
                <label className="mb-1 block text-xs font-medium text-neutral-700">Full price</label>
                <div className="flex items-center gap-2">
                  <select
                    value={currency ?? ""}
                    onChange={(e) => setCurrency(e.target.value)}
                    disabled={!currency}
                    className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0"
                    className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-neutral-200 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={add}
            disabled={saving || !currency}
            className="shrink-0 rounded-md bg-neutral-900 px-5 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            {saving ? "Adding…" : `Add ${item}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
