"use client";

import { useState } from "react";
import type { SectionMedia } from "@/lib/curationSections";
import FadeImage from "@/components/FadeImage";

// One of a curation's Supporting Media on a page (2026-10-25): a picture,
// or a video shown as its still picture with a ▶ button — clicked, it
// plays where it is, with sound and controls (Craig's choice). A video
// without a still picture shows its first frame. `fill`: it fills the
// box it's in (the box sets the shape; pictures cropped to it, a playing
// video shown whole); otherwise it's the full width at its own shape.
export default function SectionMediaView({
  media,
  alt = "",
  fill = false,
  className = "",
}: {
  media: Pick<SectionMedia, "kind" | "url" | "posterUrl">;
  alt?: string;
  fill?: boolean;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const box = fill ? "absolute inset-0 h-full w-full" : "block w-full";

  if (media.kind === "PHOTO") {
    return <FadeImage src={media.url} alt={alt} className={`${box} ${fill ? "object-cover" : ""} ${className}`} />;
  }

  if (playing) {
    return (
      <video
        src={media.url}
        controls
        autoPlay
        playsInline
        className={`${box} bg-black ${fill ? "object-contain" : ""} ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setPlaying(true);
      }}
      aria-label="Play video"
      className={`group ${fill ? "absolute inset-0" : "relative block w-full"} ${className}`}
    >
      {media.posterUrl ? (
        <FadeImage src={media.posterUrl} alt={alt} className={`${box} ${fill ? "object-cover" : ""}`} />
      ) : (
        <video src={media.url} preload="metadata" muted playsInline className={`${box} object-cover`} />
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-white transition group-hover:bg-black/75">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </span>
    </button>
  );
}

// In the admin (2026-10-25): what to show for one of the Supporting
// Media in a small tile — a picture, or a video's still picture (null
// when it has none) — and the ▶ mark over a video's tile.
export function stillOf(media: Pick<SectionMedia, "kind" | "url" | "posterUrl">): string | null {
  return media.kind === "VIDEO" ? media.posterUrl : media.url;
}

export function PlayMark() {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </span>
  );
}
