"use client";

import { useState } from "react";
import AddArtwork from "@/components/studio/AddArtwork";
import ArtworkCatalogue from "@/components/studio/ArtworkCatalogue";
import ConsignArtwork from "@/components/studio/ConsignArtwork";
import RecordSale from "@/components/studio/RecordSale";
import TakePayment from "@/components/studio/TakePayment";
import { NoticeLine, panelCls, StudioButton } from "@/components/studio/StudioUi";
import type { Notice } from "@/components/studio/StudioUi";
import type { StudioArtworkTile } from "@/lib/studioArtworks";
import type { StudioSettings } from "@/lib/studioSettings";
import { priceToInput } from "@/lib/studioShared";

// The Studio app for one artist: the first screen (logo + four options)
// and whichever flow the artist chose. Consign, Sold and Payment each
// start from the artwork catalogue (for Consign and Sold, unsold works
// only, chosen with a single tap); once a work is chosen, that flow's own
// screen takes over. Tapping the "JEVCA Studio" title always returns to
// the first screen. On the Payment panel a magnifier beside the title
// shows the chosen artwork large, over everything; tapping closes it.

type Mode = "home" | "add" | "consign" | "sold" | "payment";

function MagnifierIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5M11 8v6M8 11h6" />
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
  const [enlarged, setEnlarged] = useState(false);

  const goHome = (message: Notice | null = null) => {
    setNotice(message);
    setArtwork(null);
    setEnlarged(false);
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
    if (!artwork) {
      return (
        <ArtworkCatalogue token={token} onChosen={setArtwork} tapToChoose={mode !== "payment"} />
      );
    }
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
          locations={settings.locations}
          paymentMethods={settings.paymentMethods}
          onDone={goHome}
          onBusyChange={setBusy}
        />
      );
    }
    return (
      <TakePayment
        token={token}
        artwork={artwork}
        saleSources={settings.saleSources}
        defaultInstalmentCount={settings.defaultInstalmentCount}
        onDone={goHome}
        onBusyChange={setBusy}
      />
    );
  };

  const enlargeUrl = mode === "payment" ? artwork?.displayUrl : null;

  return (
    <main
      className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-[#555]"
      style={{ fontFamily: '"Gill Sans", "Gill Sans MT", Calibri, sans-serif' }}
    >
      <div className="relative flex justify-center">
        <button
          type="button"
          onClick={() => goHome()}
          disabled={busy}
          className="py-2 text-center text-xl leading-snug"
        >
          <div>JEVCA Studio</div>
          <div>Personal Art Manager</div>
        </button>
        {enlargeUrl && (
          <button
            type="button"
            onClick={() => setEnlarged(true)}
            aria-label="Show the artwork larger"
            className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-[#333]"
          >
            <MagnifierIcon />
          </button>
        )}
      </div>

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

      {enlarged && enlargeUrl && (
        <button
          type="button"
          onClick={() => setEnlarged(false)}
          aria-label="Close the larger view"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
        >
          <img
            src={enlargeUrl}
            alt={artwork?.title ?? ""}
            className="max-h-full max-w-full object-contain"
          />
        </button>
      )}
    </main>
  );
}
