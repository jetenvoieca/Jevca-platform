"use client";

import { useState } from "react";
import AddArtwork from "@/components/studio/AddArtwork";
import ArtworkCatalogue from "@/components/studio/ArtworkCatalogue";
import ConsignArtwork from "@/components/studio/ConsignArtwork";
import RecordSale from "@/components/studio/RecordSale";
import SendInstructions from "@/components/studio/SendInstructions";
import { NoticeLine, panelCls, StudioButton } from "@/components/studio/StudioUi";
import type { Notice } from "@/components/studio/StudioUi";
import type { StudioArtworkTile } from "@/lib/studioArtworks";
import type { StudioSettings } from "@/lib/studioSettings";
import { priceToInput } from "@/lib/studioShared";

// The Studio app for one artist: the first screen (logo + four options)
// and whichever flow the artist chose. Consign and Sold each start from
// the catalogue of unsold works, where a single tap chooses one; that
// flow's own screen then takes over. Instructions (2026-10-31, Craig's
// mockup — replacing Payment, which will come back revised) sends a note
// to the artist's Hopper. Every screen but the first has a Back link at
// the top left to the first screen (as does tapping the "JEVCA Studio"
// title).

type Mode = "home" | "add" | "consign" | "sold" | "instructions";

function BackIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export default function StudioApp({
  token,
  artistName,
  logoUrl,
  settings,
}: {
  token: string;
  artistName: string;
  logoUrl: string | null;
  settings: StudioSettings;
}) {
  const [mode, setMode] = useState<Mode>("home");
  const [artwork, setArtwork] = useState<StudioArtworkTile | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // True while a flow is saving something — leaving then would hide
  // whether it worked.
  const [busy, setBusy] = useState(false);

  const goHome = (message: Notice | null = null) => {
    setNotice(message);
    setArtwork(null);
    setMode("home");
  };

  const start = (next: Mode) => {
    setNotice(null);
    setArtwork(null);
    setMode(next);
  };

  const flow = () => {
    if (mode === "add") {
      return (
        <AddArtwork
          token={token}
          artworkTypes={settings.artworkTypes}
          sizePresets={settings.sizePresets}
          locations={settings.locations}
          onDone={goHome}
          onBusyChange={setBusy}
        />
      );
    }
    if (mode === "instructions") {
      return <SendInstructions token={token} onDone={goHome} onBusyChange={setBusy} />;
    }
    if (!artwork) return <ArtworkCatalogue token={token} onChosen={setArtwork} />;
    if (mode === "consign") {
      return (
        <ConsignArtwork
          token={token}
          artwork={artwork}
          locations={settings.locations}
          onDone={goHome}
          onBusyChange={setBusy}
        />
      );
    }
    return (
      <RecordSale
        token={token}
        artwork={artwork}
        initialPrice={priceToInput(artwork.price)}
        initialCurrency={artwork.priceCurrency}
        locations={settings.locations}
        paymentMethods={settings.paymentMethods}
        onDone={goHome}
        onBusyChange={setBusy}
      />
    );
  };

  return (
    <main
      className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-[#555]"
      style={{ fontFamily: '"Gill Sans", "Gill Sans MT", Calibri, sans-serif' }}
    >
      <div className="relative flex justify-center">
        {mode !== "home" && (
          <button
            type="button"
            onClick={() => goHome()}
            disabled={busy}
            className="absolute left-0 top-1/2 flex -translate-y-1/2 items-center py-2 pr-2 text-lg text-[#333] disabled:opacity-50"
          >
            <BackIcon />
            Back
          </button>
        )}
        <button
          type="button"
          onClick={() => goHome()}
          disabled={busy}
          className="py-2 text-center text-xl leading-snug"
        >
          <div>JEVCA Studio</div>
          <div>Personal Art Manager</div>
        </button>
      </div>

      {mode === "home" ? (
        <section className={`${panelCls} flex flex-1 flex-col justify-between gap-4 p-4`}>
          <div className="flex flex-col gap-4">
            <div className="flex justify-center bg-white p-2">
              {logoUrl ? (
                // Capped at 30% of the screen height so the four buttons
                // below always fit on screen, even with a tall logo.
                <img
                  src={logoUrl}
                  alt={artistName}
                  className="max-h-[30dvh] w-auto max-w-full object-contain"
                />
              ) : (
                <span className="py-8 text-2xl">{artistName}</span>
              )}
            </div>
            <NoticeLine notice={notice} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <StudioButton onClick={() => start("add")}>NEW ART</StudioButton>
            <StudioButton onClick={() => start("consign")}>CONSIGN</StudioButton>
            <StudioButton onClick={() => start("sold")}>SOLD</StudioButton>
            <StudioButton onClick={() => start("instructions")}>INSTRUCTIONS</StudioButton>
          </div>
        </section>
      ) : (
        flow()
      )}
    </main>
  );
}
