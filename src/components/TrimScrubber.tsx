"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Mode = "trim" | "mark";

export default function TrimScrubber({
  videoUrl,
  trimIn,
  trimOut,
  sourceDuration,
  onKnownDuration,
  onTrimChange,
  onSplit,
}: {
  videoUrl: string;
  trimIn: number;
  trimOut: number;
  sourceDuration: number | null;
  // Called once, only the first time the browser reports the real source
  // duration (sourceDuration is still null at that point).
  onKnownDuration: (duration: number) => void;
  onTrimChange: (trimIn: number, trimOut: number) => void;
  onSplit: (cutStart: number, cutEnd: number) => void;
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
    [onTrimChange]
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
        commitTrim(Math.min(t, localOut - 0.1), localOut);
      } else if (dragging === "out") {
        commitTrim(localIn, Math.max(t, localIn + 0.1));
      } else if (dragging === "playhead") {
        setPlayhead(t);
        if (videoRef.current) videoRef.current.currentTime = t;
      } else if (markDragging && mark) {
        setMark({ start: mark.start, end: Math.max(mark.start + 0.1, t) });
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
      <video
        ref={videoRef}
        src={videoUrl}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        className="mb-3 max-h-64 w-full rounded-md bg-black"
        playsInline
      />

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

            <div className="ml-auto flex items-center gap-2">
              {mode === "trim" ? (
                <button
                  type="button"
                  onClick={() => setMode("mark")}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                >
                  Mark section to cut
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMark(null);
                      setMode("trim");
                    }}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!mark}
                    onClick={confirmSplit}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
                  >
                    Remove marked section
                  </button>
                </>
              )}
            </div>
          </div>

          <div
            ref={barRef}
            className="relative h-10 w-full cursor-pointer select-none rounded-md bg-neutral-100"
            onPointerDown={(e) => {
              if (mode === "mark") {
                startMark(e.clientX);
              } else {
                setDragging("playhead");
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
            <div
              className="absolute top-0 h-full w-0.5 bg-neutral-900"
              style={{ left: `${pct(playhead)}%` }}
            />
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
            <span className="text-sm text-neutral-500">
              Kept: {formatTime(Math.max(0, localOut - localIn))}
            </span>
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
