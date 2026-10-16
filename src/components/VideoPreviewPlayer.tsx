"use client";

import { useEffect, useRef, useState } from "react";
import { useBackdropClose } from "@/lib/useBackdropClose";
import {
  clipLength,
  clipStarts,
  totalTimelineSeconds,
  videoSize,
  type TimelineClip,
  type VideoShape,
} from "@/lib/videoTimeline";
import { stickerPreviewStyle, type StickerRow } from "@/lib/stickers";

// Video Edit's Preview (2026-10-16): plays the video as it stands, in the
// browser, before it's sent to be rendered — on the render's own timing:
// the clips in order at the video's shape (photos for their seconds,
// videos between their trim points), each fading in over the one before
// across the same overlap as the render, with their stickers, and the music
// under it fading in and out. Close to the render, not exact to the frame.

type PreviewClip = TimelineClip & { image: { url: string; kind: "PHOTO" | "VIDEO" } };

const FADE_SECONDS = 1;
const TICK_MS = 50;

function FadeIn({ seconds, children }: { seconds: number; children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      className={`absolute inset-0 transition-opacity ${shown ? "opacity-100" : "opacity-0"}`}
      style={{ transitionDuration: `${seconds * 1000}ms` }}
    >
      {children}
    </div>
  );
}

export default function VideoPreviewPlayer({
  clips,
  shape,
  music,
  muteClips,
  fadeSeconds,
  stickerLibrary,
  onClose,
}: {
  clips: PreviewClip[];
  shape: VideoShape;
  // How long one clip takes to fade into the next (0: a cut).
  fadeSeconds: number;
  music: { url: string; volume: number } | null;
  muteClips: boolean;
  stickerLibrary: StickerRow[];
  onClose: () => void;
}) {
  const size = videoSize(shape);
  const total = totalTimelineSeconds(clips, fadeSeconds);
  const starts = clipStarts(clips, fadeSeconds);
  // Seconds into the video; null before it starts.
  const [time, setTime] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const startedAt = useRef(0);
  const backdrop = useBackdropClose(onClose);
  const stickers = new Map(stickerLibrary.map((s) => [s.id, s]));
  const musicVolume = music?.volume ?? 0;

  const running = time != null && time < total;

  const play = () => {
    startedAt.current = performance.now();
    setTime(0);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.volume = 0;
      audio.play().catch(() => {});
    }
  };

  // The clock, and the music's fade in and out; the music stops at the end.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      const t = (performance.now() - startedAt.current) / 1000;
      setTime(t);
      const audio = audioRef.current;
      if (!audio) return;
      if (t >= total) audio.pause();
      else audio.volume = musicVolume * Math.max(0, Math.min(1, t / FADE_SECONDS, (total - t) / FADE_SECONDS));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [running, total, musicVolume]);

  // Closing stops everything.
  useEffect(() => () => audioRef.current?.pause(), []);

  // The clips on screen now — two while one fades in over the other.
  const showing = running
    ? clips
        .map((clip, i) => ({ clip, i }))
        .filter(({ clip, i }) => time >= starts[i] && time < starts[i] + clipLength(clip))
    : [];
  const current = showing.length > 0 ? showing[showing.length - 1].i : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" {...backdrop}>
      <div className="flex max-h-full flex-col items-center gap-3">
        <div
          className="relative h-[70vh] max-w-[90vw] overflow-hidden rounded-lg bg-black"
          style={{ aspectRatio: `${size.width} / ${size.height}` }}
        >
          {showing.map(({ clip, i }) => (
            <FadeIn key={`${clip.id}-${i}`} seconds={i === 0 ? 0 : fadeSeconds}>
              {clip.kind === "PHOTO" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={clip.image.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <video
                  src={clip.image.url}
                  muted={muteClips}
                  playsInline
                  className="h-full w-full object-cover"
                  onLoadedMetadata={(e) => {
                    e.currentTarget.currentTime = clip.trimIn ?? 0;
                    e.currentTarget.play().catch(() => {});
                  }}
                />
              )}
              {(clip.stickers ?? []).map((s) => {
                const sticker = stickers.get(s.stickerId);
                return sticker ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={s.id} src={sticker.url} alt="" style={stickerPreviewStyle(s.position, s.size)} />
                ) : null;
              })}
            </FadeIn>
          ))}
          {!running && (
            <button
              type="button"
              onClick={play}
              className="absolute inset-0 flex items-center justify-center text-white"
            >
              <span className="rounded-full bg-white/20 px-6 py-3 text-lg backdrop-blur hover:bg-white/30">
                {time == null ? "▶ Play preview" : "↻ Play again"}
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-4 text-sm text-white">
          <span>
            {current != null ? `Clip ${current + 1} of ${clips.length} · ` : ""}
            {Math.min(time ?? 0, total).toFixed(0)}s / {total.toFixed(0)}s
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/40 px-3 py-1 hover:bg-white/10"
          >
            Close
          </button>
        </div>
        <p className="text-xs text-white/60">A preview on the render&apos;s timing — the render itself is exact to the frame.</p>
        {music && <audio ref={audioRef} src={music.url} preload="auto" />}
      </div>
    </div>
  );
}
