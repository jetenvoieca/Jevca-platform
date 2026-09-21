"use client";

import { useState } from "react";
import AddArtwork from "@/components/studio/AddArtwork";
import ManageArtworks from "@/components/studio/ManageArtworks";
import { NoticeLine, panelCls, StudioButton } from "@/components/studio/StudioUi";
import type { Notice } from "@/components/studio/StudioUi";
import type { StudioSettings } from "@/lib/studioSettings";

// The Studio app for one artist: the first screen (logo + two options)
// and whichever flow the artist chose. Tapping the "JEVCA Studio" title
// always returns to the first screen.

type Mode = "home" | "add" | "manage";

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
  const [notice, setNotice] = useState<Notice | null>(null);
  // True while a flow is saving something — leaving then would hide
  // whether it worked.
  const [busy, setBusy] = useState(false);

  const goHome = (message: Notice | null = null) => {
    setNotice(message);
    setMode("home");
  };

  const start = (next: Mode) => {
    setNotice(null);
    setMode(next);
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

      {mode === "home" && (
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
          <div className="flex gap-4">
            <StudioButton onClick={() => start("add")}>Add new Artwork</StudioButton>
            <StudioButton onClick={() => start("manage")}>Manage existing</StudioButton>
          </div>
        </section>
      )}

      {mode === "add" && (
        <AddArtwork
          token={token}
          artworkTypes={settings.artworkTypes}
          sizePresets={settings.sizePresets}
          onDone={goHome}
          onBusyChange={setBusy}
        />
      )}

      {mode === "manage" && (
        <ManageArtworks
          token={token}
          settings={settings}
          onDone={goHome}
          onBusyChange={setBusy}
        />
      )}
    </main>
  );
}
