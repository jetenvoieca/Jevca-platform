"use client";

import { useState } from "react";
import { consignArtwork } from "@/lib/studioApi";
import type { StudioArtworkTile } from "@/lib/studioArtworks";
import { NoticeLine, panelCls, StudioButton } from "@/components/studio/StudioUi";
import type { Notice } from "@/components/studio/StudioUi";

// "Consigned": choose which location (gallery) the chosen artwork is
// consigned to, from the artist's own Locations list in Settings.

export default function ConsignArtwork({
  token,
  artwork,
  locations,
  onDone,
  onBusyChange,
}: {
  token: string;
  artwork: StudioArtworkTile;
  locations: string[];
  // Called once the artwork is consigned — the app returns to its first
  // screen showing this message.
  onDone: (notice: Notice) => void;
  // Lets the app stop the artist leaving while the change is being saved.
  onBusyChange: (busy: boolean) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [consigning, setConsigning] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const consign = async () => {
    if (!chosen) {
      setNotice({ text: "Choose a gallery first.", tone: "info" });
      return;
    }

    setConsigning(true);
    onBusyChange(true);
    setNotice({ text: "Consigning…", tone: "info" });
    try {
      await consignArtwork(token, artwork.id, chosen);
      onDone({ text: `Consigned to ${chosen}`, tone: "info" });
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
      <NoticeLine notice={notice} />
      <section className={`${panelCls} p-4`}>
        <div className="flex gap-4">
          <StudioButton onClick={consign} disabled={consigning}>
            Consign to gallery
          </StudioButton>
        </div>
      </section>
    </>
  );
}
