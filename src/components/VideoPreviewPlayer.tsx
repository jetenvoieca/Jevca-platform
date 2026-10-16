"use client";

import { useEffect, useRef, useState } from "react";
import { useBackdropClose } from "@/lib/useBackdropClose";
import { clipLength, totalTimelineSeconds, videoSize, type TimelineClip, type VideoShape } from "@/lib/videoTimeline";
import { stickerPreviewStyle, type StickerRow } from "@/lib/stickers";

// Video Edit's Preview (2026-10-16): plays the video as it stands, in the
// browser, before it's sent to be rendered — the clips in order at the
// video's shape (photos for their seconds, videos between their trim
// points), each fading in, with their stickers, and the music under it
// fading in and out. Close to the render, not exact: the render
// crossfades clips over each other and its timing is to the frame.

type PreviewClip = TimelineClip & { image: { url: string; kind: "PHOTO" | "VIDEO" } };

const FADE_SECONDS = 1;

function FadeIn({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className={`absolute inset-0 transition-opacity duration-700 ${shown ? "opacity-100" : "opacity-0"}`}>
      {children}
    </div>
  );
}

export default function VideoPreviewPlayer({
  clips,
  shape,
  music,
  muteClips,
  stickerLibrary,
  onClose,
}: {
  clips: PreviewClip[];
  shape: VideoShape;
  music: { url: string; volume: number } | null;
  muteClips: boolean;
  stickerLibrary: StickerRow[];
  onClose: () => void;
}) {
  const size = videoSize(shape);
  const total = totalTimelineSeconds(clips);
  // The clip showing; clips.length once it has finished; -1 before it starts.
  const [index, setIndex] = useState(-1);
  const [elapsed, setElapsed] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const startedAt = useRef(0);
  const backdrop = useBackdropClose(onClose);
  const stickers = new Map(stickerLibrary.map((s) => [s.id, s]));

  const next = () => setIndex((i) => i + 1);

  const play = () => {
    startedAt.current = performance.now();
    setElapsed(0);
    setIndex(0);
    const audio = audioRef.current;
    if (audio && music) {
      audio.currentTime = 0;
      audio.volume = 0;
      audio.play().catch(() => {});
    }
  };

  // Photos move on after their seconds; videos when they reach their end
  // (below), with a safety stop in case a video never plays.
  useEffect(() => {
    const clip = clips[index];
    if (!clip) return;
    const seconds = clip.kind === "PHOTO" ? clip.duration ?? 2 : clipLength(clip) + 5;
    const timer = setTimeout(next, seconds * 1000);
    return () => clearTimeout(timer);
  }, [index, clips]);

  // The running time, and the music's fade in and out.
  const running = index >= 0 && index < clips.length;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      const t = (performance.now() - startedAt.current) / 1000;
      setElapsed(t);
      const audio = audioRef.current;
      if (audio && music) {
        const fade = Math.max(0, Math.min(1, t / FADE_SECONDS, (total - t) / FADE_SECONDS));
        audio.volume = music.volume * fade;
      }
    }, 100);
    return () => clearInterval(timer);
  }, [running, music, total]);

  // Finished: the music stops.
  useEffect(() => {
    if (index >= clips.length) audioRef.current?.pause();
  }, [index, clips.length]);

  // Closing stops everything.
  useEffect(() => () => audioRef.current?.pause(), []);

  const clip = running ? clips[index] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" {...backdrop}>
      <div className="flex max-h-full flex-col items-center gap-3">
        <div
          className="relative h-[70vh] max-w-[90vw] overflow-hidden rounded-lg bg-black"
          style={{ aspectRatio: `${size.width} / ${size.height}` }}
        >
          {clip && (
            <FadeIn key={`${clip.id}-${index}`}>
              {clip.kind === "PHOTO" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={clip.image.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <video
                  ref={videoRef}
                  src={clip.image.url}
                  muted={muteClips}
                  playsInline
                  autoPlay
                  className="h-full w-full object-cover"
                  onLoadedMetadata={(e) => {
                    e.currentTarget.currentTime = clip.trimIn ?? 0;
                    e.currentTarget.play().catch(() => {});
                  }}
                  onTimeUpdate={(e) => {
                    if (e.currentTarget.currentTime >= (clip.trimOut ?? Infinity)) next();
                  }}
                  onEnded={next}
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
          )}
          {!running && (
            <button
              type="button"
              onClick={play}
              className="absolute inset-0 flex items-center justify-center text-white"
            >
              <span className="rounded-full bg-white/20 px-6 py-3 text-lg backdrop-blur hover:bg-white/30">
                {index === -1 ? "▶ Play preview" : "↻ Play again"}
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-4 text-sm text-white">
          <span>
            {running ? `Clip ${index + 1} of ${clips.length} · ` : ""}
            {Math.min(elapsed, total).toFixed(0)}s / {total.toFixed(0)}s
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/40 px-3 py-1 hover:bg-white/10"
          >
            Close
          </button>
        </div>
        <p className="text-xs text-white/60">A preview — the rendered video crossfades and times clips exactly.</p>
        {music && <audio ref={audioRef} src={music.url} preload="auto" />}
      </div>
    </div>
  );
}
