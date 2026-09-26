"use client";

import { useState } from "react";
import AddArtwork from "@/components/studio/AddArtwork";
import ArtworkCatalogue from "@/components/studio/ArtworkCatalogue";
import ConsignArtwork from "@/components/studio/ConsignArtwork";
import RecordSale from "@/components/studio/RecordSale";
import SellArtwork from "@/components/studio/SellArtwork";
import { NoticeLine, panelCls, StudioButton } from "@/components/studio/StudioUi";
import type { Notice } from "@/components/studio/StudioUi";
import type { StudioArtworkTile } from "@/lib/studioArtworks";
import type { StudioSettings } from "@/lib/studioSettings";
import { priceToInput } from "@/lib/studioShared";

// The Studio app for one artist: the first screen (logo + four options)
// and whichever flow the artist chose. Consign, Sold and Payment each
// start from the artwork catalogue; once a work is chosen, that flow's own
// screen takes over. Tapping the "JEVCA Studio" title always returns to
// the first screen.

type Mode = "home" | "add" | "consign" | "sold" | "payment";

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
          onDone={goHome}
          onBusyChange={setBusy}
        />
      );
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
    if (mode === "sold") {
      return (
        <RecordSale
          token={token}
          artwork={artwork}
          initialPrice={priceToInput(artwork.price)}
          initialCurrency={artwork.priceCurrency}
          saleSources={settings.saleSources}
          paymentMethods={settings.paymentMethods}
          onDone={goHome}
          onBusyChange={setBusy}
        />
      );
    }
    return (
      <SellArtwork
        token={token}
        artwork={artwork}
        settings={settings}
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
      <button
        type="button"
        onClick={() => goHome()}
        disabled={busy}
        className="py-2 text-center text-xl leading-snug"
      >
        <div>JEVCA Studio</div>
        <div>Personal Art Manager</div>
      </button>

      {mode === "home" ? (
        <section className={`${panelCls} flex flex-1 flex-col justify-between gap-4 p-4`}>
          <div className="flex flex-col gap-4">
            <div className="flex justify-center bg-white p-2">
              {logoUrl ? (
                <img src={logoUrl} alt={artistName} className="w-full object-contain" />
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
            <StudioButton onClick={() => start("payment")}>PAYMENT</StudioButton>
          </div>
        </section>
      ) : (
        flow()
      )}
    </main>
  );
}
