"use client";

import { useState } from "react";
import { consignArtwork } from "@/lib/studioApi";
import type { StudioArtworkTile } from "@/lib/studioArtworks";
import { CURRENCIES } from "@/lib/currencies";
import { parsePrice, priceToInput } from "@/lib/studioShared";
import { inputCls, NoticeLine, panelCls, StudioButton } from "@/components/studio/StudioUi";
import type { Notice } from "@/components/studio/StudioUi";

// "Consign": choose which of the artist's Locations (a gallery, or one of
// their own places) the chosen artwork goes to, and the price and currency
// agreed there. The price starts as the artwork's current one, and saving
// it replaces that price everywhere (see Artwork.priceCurrency).

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
      <section className="aspect-square overflow-y-auto rounded-lg border border-[#cfcac0] bg-white">
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
      </div>
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
