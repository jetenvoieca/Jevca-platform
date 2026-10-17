"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useVideoStills } from "@/lib/useVideoStills";

// The stills either side of the playhead: how far before and after it.
const BEFORE = [
  { offset: -1.5, label: "1½s before" },
  { offset: -1, label: "1s before" },
  { offset: -0.5, label: "½s before" },
];
const AFTER = [
  { offset: 0.5, label: "½s after" },
  { offset: 1, label: "1s after" },
  { offset: 1.5, label: "1½s after" },
];

type Mode = "trim" | "mark";

const SEEK_GIVE_UP_MS = 1000;

const SMALL_BUTTON =
  "rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";

export default function TrimScrubber({
  videoUrl,
  aspectRatio,
  overlay,
  trimIn,
  trimOut,
  sourceDuration,
  onKnownDuration,
  onTrimChange,
  onSplit,
  onGrabStill,
}: {
  videoUrl: string;
  // Shown as it will be in the video (2026-10-17): at the video's shape
  // ("width / height"), cropped to fill it, with `overlay` (its stickers)
  // on top.
  aspectRatio: string;
  overlay?: ReactNode;
  trimIn: number;
  trimOut: number;
  sourceDuration: number | null;
  // Called once, only the first time the browser reports the real source
  // duration (sourceDuration is still null at that point).
  onKnownDuration: (duration: number) => void;
  onTrimChange: (trimIn: number, trimOut: number) => void;
  onSplit: (cutStart: number, cutEnd: number) => void;
  // Grab still (2026-10-17): the frame at the playhead, for the Hopper.
  onGrabStill: (atSecond: number) => Promise<{ ok: true } | { error: string }>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const [duration, setDuration] = useState<number | null>(sourceDuration);
  const [playhead, setPlayhead] = useState(trimIn);
  const [isPlaying, setIsPlaying] = useState(false);
  const [dragging, setDragging] = useState<"in" | "out" | "playhead" | null>(null);
  const [mode, setMode] = useState<Mode>("trim");
  const [mark, setMark] = useState<{ start: number; end: number } | null>(null);
  const [markDragging, setMarkDragging] = useState(false);

  // Locally-responsive trim values, synced up to the parent (and from
  // there persisted) on a short debounce rather than on every pixel of
  // drag.
  const [localIn, setLocalIn] = useState(trimIn);
  const [localOut, setLocalOut] = useState(trimOut);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalIn(trimIn);
    setLocalOut(trimOut);
  }, [trimIn, trimOut]);

  const commitTrim = useCallback(
    (nextIn: number, nextOut: number) => {
      setLocalIn(nextIn);
      setLocalOut(nextOut);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onTrimChange(nextIn, nextOut), 400);
    },
    [onTrimChange],
  );

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    if (duration == null) {
      const d = video.duration;
      setDuration(d);
      onKnownDuration(d);
    }
  };

  const timeFromClientX = (clientX: number): number => {
    const bar = barRef.current;
    if (!bar || !duration) return 0;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  useEffect(() => {
    if (!dragging && !markDragging) return;

    const handleMove = (e: PointerEvent) => {
      const t = timeFromClientX(e.clientX);
      if (dragging === "in") {
        const next = Math.min(t, localOut - 0.1);
        commitTrim(next, localOut);
        showAt(next);
      } else if (dragging === "out") {
        const next = Math.max(t, localIn + 0.1);
        commitTrim(localIn, next);
        showAt(next);
      } else if (dragging === "playhead") {
        showAt(withinKept(t));
      } else if (markDragging && mark) {
        const end = Math.max(mark.start + 0.1, t);
        setMark({ start: mark.start, end });
        showAt(end);
      }
    };
    const handleUp = () => {
      setDragging(null);
      setMarkDragging(false);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, markDragging, localIn, localOut, mark, duration]);

  // The video shows the point being set (2026-10-17): the playhead, a
  // trim handle, or the end of the section being marked.
  const showAt = (t: number) => {
    setPlayhead(t);
    seekTo(t);
  };

  // One seek at a time (2026-10-17): asking the video for a new frame on
  // every move of the pointer piles the seeks up until it stops showing
  // any. While one is under way, only the latest point asked for is kept,
  // and it's sought when that one finishes.
  const seekWanted = useRef<number | null>(null);
  const seekBusySince = useRef<number | null>(null);
  const seekTo = (t: number) => {
    const video = videoRef.current;
    if (!video) return;
    seekWanted.current = t;
    // A seek that never reports finishing is given up on after a second.
    if (seekBusySince.current != null && Date.now() - seekBusySince.current < SEEK_GIVE_UP_MS) return;
    seekBusySince.current = Date.now();
    seekWanted.current = null;
    video.currentTime = t;
  };
  const handleSeeked = () => {
    seekBusySince.current = null;
    const next = seekWanted.current;
    if (next != null) seekTo(next);
  };

  const [still, setStill] = useState<"idle" | "working" | "sent">("idle");
  const [stillError, setStillError] = useState<string | null>(null);
  const grabStill = async () => {
    setStill("working");
    setStillError(null);
    const result = await onGrabStill(playhead);
    if ("error" in result) {
      setStillError(result.error);
      setStill("idle");
      return;
    }
    setStill("sent");
    setTimeout(() => setStill("idle"), 3000);
  };

  // The playhead stays within the kept part, between the handles (2026-10-17).
  const withinKept = (t: number) => Math.min(localOut, Math.max(localIn, t));

  // The stills either side of where the video is.
  const nearby = [...BEFORE, ...AFTER];
  const { videoRef: stillsVideoRef, stills } = useVideoStills(
    duration,
    nearby.map((n) => playhead + n.offset),
  );
  const stillFor = (n: (typeof nearby)[number]) => (
    <Still key={n.offset} canvas={stills[nearby.indexOf(n)]} aspectRatio={aspectRatio} label={n.label} />
  );

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      if (video.currentTime < localIn || video.currentTime >= localOut) {
        video.currentTime = localIn;
      }
      video.play();
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setPlayhead(video.currentTime);
    if (video.currentTime >= localOut) {
      video.pause();
      setIsPlaying(false);
    }
  };

  const startMark = (clientX: number) => {
    const t = timeFromClientX(clientX);
    const clamped = Math.min(Math.max(t, localIn), localOut);
    setMark({ start: clamped, end: clamped });
    setMarkDragging(true);
    showAt(clamped);
  };

  const confirmSplit = () => {
    if (!mark) return;
    onSplit(mark.start, mark.end);
    setMark(null);
    setMode("trim");
  };

  const pct = (t: number) => (duration ? (t / duration) * 100 : 0);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-center gap-3">
        {BEFORE.map(stillFor)}
        <div className="flex flex-col items-center gap-2">
          <div className="relative h-64 overflow-hidden rounded-md bg-black" style={{ aspectRatio }}>
            <video
              ref={videoRef}
              src={videoUrl}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onSeeked={handleSeeked}
              className="h-full w-full object-cover"
              playsInline
            />
            {/* Above the video: a playing video can be drawn over its siblings. */}
            <div className="pointer-events-none absolute inset-0 z-10">{overlay}</div>
          </div>
          {/* Under the picture: cut a section out, or take this frame as a still. */}
          {duration != null && (
            // Centred under the picture, as wide as it needs without widening it.
            <div className="relative h-9 w-full">
              <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap">
                {mode === "trim" ? (
                  <button type="button" onClick={() => setMode("mark")} className={SMALL_BUTTON}>
                    Mark section
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMark(null);
                        setMode("trim");
                      }}
                      className={SMALL_BUTTON}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!mark}
                      onClick={confirmSplit}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
                    >
                      Remove section
                    </button>
                  </div>
                )}
                <button type="button" onClick={grabStill} disabled={still === "working"} className={SMALL_BUTTON}>
                  {still === "working" ? "Grabbing…" : still === "sent" ? "Sent to the Hopper" : "Grab still"}
                </button>
              </div>
            </div>
          )}
          {stillError && <p className="text-xs text-red-600">{stillError}</p>}
        </div>
        {AFTER.map(stillFor)}
        {/* The hidden copy the stills are made from. */}
        <video
          ref={stillsVideoRef}
          src={videoUrl}
          muted
          playsInline
          preload="auto"
          className="pointer-events-none absolute h-px w-px opacity-0"
        />
      </div>

      {duration == null ? (
        <p className="text-sm text-neutral-400">Loading video…</p>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <span className="text-xs text-neutral-500">
              {formatTime(playhead)} / {formatTime(duration)}
            </span>
          </div>

          <div
            ref={barRef}
            className="relative h-10 w-full cursor-pointer select-none rounded-md bg-neutral-100"
            onPointerDown={(e) => {
              if (mode === "mark") {
                startMark(e.clientX);
              } else {
                setDragging("playhead");
                showAt(withinKept(timeFromClientX(e.clientX)));
              }
            }}
          >
            {/* Kept range */}
            <div
              className="absolute top-0 h-full bg-neutral-300"
              style={{ left: `${pct(localIn)}%`, width: `${pct(localOut) - pct(localIn)}%` }}
            />
            {/* Marked-for-removal range */}
            {mark && (
              <div
                className="absolute top-0 h-full bg-red-300"
                style={{ left: `${pct(mark.start)}%`, width: `${pct(mark.end) - pct(mark.start)}%` }}
              />
            )}
            {/* Playhead */}
            <div className="absolute top-0 h-full w-0.5 bg-neutral-900" style={{ left: `${pct(playhead)}%` }} />
            {/* Trim handles */}
            {mode === "trim" && (
              <>
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDragging("in");
                  }}
                  className="absolute top-0 h-full w-2 cursor-ew-resize rounded-l-md bg-neutral-900"
                  style={{ left: `calc(${pct(localIn)}% - 4px)` }}
                />
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDragging("out");
                  }}
                  className="absolute top-0 h-full w-2 cursor-ew-resize rounded-r-md bg-neutral-900"
                  style={{ left: `calc(${pct(localOut)}% - 4px)` }}
                />
              </>
            )}
          </div>

          <div className="mt-3 flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              Start
              <input
                type="number"
                step={0.1}
                min={0}
                max={localOut - 0.1}
                value={round1(localIn)}
                onChange={(e) => commitTrim(Number(e.target.value), localOut)}
                className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              End
              <input
                type="number"
                step={0.1}
                min={localIn + 0.1}
                max={duration}
                value={round1(localOut)}
                onChange={(e) => commitTrim(localIn, Number(e.target.value))}
                className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </label>
            <span className="text-sm text-neutral-500">Kept: {formatTime(Math.max(0, localOut - localIn))}</span>
          </div>
        </>
      )}
    </div>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}

// A still beside the video: a kept frame drawn onto a canvas, cropped
// to the video's shape. Until its frame is made it keeps the last one.
function Still({
  canvas,
  aspectRatio,
  label,
}: {
  canvas: HTMLCanvasElement | null;
  aspectRatio: string;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = ref.current;
    if (!target || !canvas) return;
    target.width = canvas.width;
    target.height = canvas.height;
    target.getContext("2d")?.drawImage(canvas, 0, 0);
  }, [canvas]);
  return (
    // Level with the middle of the picture (h-64): (16rem - 5rem) / 2.
    <div className="mt-[5.5rem] flex flex-col items-center gap-1 opacity-80">
      <div className="h-20 overflow-hidden rounded-md bg-black" style={{ aspectRatio }}>
        <canvas ref={ref} className="h-full w-full object-cover" />
      </div>
      <span className="text-xs text-neutral-400">{label}</span>
    </div>
  );
}
