"use client";

import { useState } from "react";
import { consignArtwork } from "@/lib/studioApi";
import type { StudioArtworkTile } from "@/lib/studioArtworks";
import { CURRENCIES } from "@/lib/currencies";
import { isEditionType, parsePrice, priceToInput } from "@/lib/studioShared";
import { inputCls, NoticeLine, panelCls, StudioButton } from "@/components/studio/StudioUi";
import type { Notice } from "@/components/studio/StudioUi";

// "Consign": the chosen work (a small picture, its name, catalogue number
// and Type), the price and currency agreed — and, when the Type is an
// edition, its edition number — then the list of the artist's Locations
// (a gallery, or one of their own places) to choose where it goes. Price,
// currency and edition start as the artwork's own, and saving replaces
// them on the artwork itself (see Artwork.priceCurrency). The list takes
// whatever height the screen has left, and scrolls.

export default function ConsignArtwork({
  token,
  artwork,
  locations,
  onDone,
  onBusyChange,
}: {
  token: string;
  artwork: StudioArtworkTile;
  // The names of the artist's Locations, from their Settings.
  locations: string[];
  // Called once the artwork is consigned — the app returns to its first
  // screen showing this message.
  onDone: (notice: Notice) => void;
  // Lets the app stop the artist leaving while the change is being saved.
  onBusyChange: (busy: boolean) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [price, setPrice] = useState(priceToInput(artwork.price));
  const [currency, setCurrency] = useState(artwork.priceCurrency);
  const hasEdition = isEditionType(artwork.type);
  const [edition, setEdition] = useState(artwork.edition ?? "");
  const [consigning, setConsigning] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const consign = async () => {
    if (!chosen) {
      setNotice({ text: "Choose a location first.", tone: "info" });
      return;
    }
    const amount = parsePrice(price);
    if (amount === null) {
      setNotice({ text: "Price must be a number, e.g. 1200 or 1200.50", tone: "error" });
      return;
    }
    if (amount === "" || Number(amount) <= 0) {
      setNotice({ text: "Enter the agreed price.", tone: "error" });
      return;
    }

    setConsigning(true);
    onBusyChange(true);
    setNotice({ text: "Consigning…", tone: "info" });
    try {
      await consignArtwork(token, {
        artworkId: artwork.id,
        location: chosen,
        price: amount,
        currency,
        edition: hasEdition ? edition.trim() : null,
      });
      onDone({ text: `Consigned ${artwork.title} to ${chosen}`, tone: "info" });
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : "Couldn't consign. Please try again.",
        tone: "error",
      });
    } finally {
      setConsigning(false);
      onBusyChange(false);
    }
  };

  return (
    <>
      <section className={`${panelCls} flex items-center gap-3 p-3`}>
        {artwork.thumbnailUrl ? (
          <img
            src={artwork.thumbnailUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-md object-cover"
          />
        ) : (
          <div className="h-16 w-16 shrink-0 rounded-md bg-white" />
        )}
        <div className="min-w-0 flex-1 leading-snug">
          <p className="truncate text-lg text-[#333]">{artwork.title}</p>
          <p className="truncate text-sm text-[#8a8a8a]">#{artwork.catalogueNumber}</p>
          <p className="truncate text-sm text-[#555]">{artwork.type}</p>
        </div>
      </section>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <input
            type="text"
            inputMode="decimal"
            placeholder="Agreed Price"
            aria-label="Agreed Price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={consigning}
            className={inputCls}
          />
        </div>
        <div className="min-w-0 flex-1">
          <select
            aria-label="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={consigning}
            className={`${inputCls} appearance-none [text-align-last:center]`}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {hasEdition && (
          <div className="min-w-0 flex-1">
            <input
              type="text"
              placeholder="Edition"
              aria-label="Edition number"
              autoComplete="off"
              value={edition}
              onChange={(e) => setEdition(e.target.value)}
              disabled={consigning}
              className={inputCls}
            />
          </div>
        )}
      </div>
      <section className="min-h-40 flex-1 overflow-y-auto rounded-lg border border-[#cfcac0] bg-white">
        {locations.length === 0 ? (
          <p className="p-6 text-center text-[#8a8a8a]">No locations set up yet.</p>
        ) : (
          locations.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setChosen(name)}
              disabled={consigning}
              className={`block w-full border-b border-[#e5e5e5] px-4 py-4 text-left text-lg text-[#333] ${
                chosen === name ? "bg-[#e6e6e6]" : ""
              }`}
            >
              {name}
            </button>
          ))
        )}
      </section>
      <NoticeLine notice={notice} />
      <section className={`${panelCls} p-4`}>
        <div className="flex gap-4">
          <StudioButton onClick={consign} disabled={consigning}>
            CONSIGN
          </StudioButton>
        </div>
      </section>
    </>
  );
}
