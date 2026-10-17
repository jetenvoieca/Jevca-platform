"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Small stills of a video, made once and kept (2026-10-17 — Video Edit's
// trimming): a hidden copy of the video is stepped through every quarter
// second, each frame drawn onto a small canvas. Asked-for times are made
// first, then the rest in order, so scrubbing soon needs no waiting.
// The canvases are only ever drawn onto other canvases, never read back,
// so this works with videos from the media domain without CORS.

const STEP = 0.25;
const STILL_WIDTH = 160;
const SEEK_TIMEOUT_MS = 3000;

// The stills nearest `times`, each null until made.
export function useVideoStills(duration: number | null, times: number[]) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stills = useRef(new Map<number, HTMLCanvasElement>());
  const wanted = useRef<number[]>([]);
  const nextInOrder = useRef(0);
  const busy = useRef(false);
  const ready = useRef(false);
  const [, setMade] = useState(0);

  const lastIndex = duration == null ? -1 : Math.floor(duration / STEP);
  const indexOf = (t: number) => Math.max(0, Math.min(lastIndex, Math.round(t / STEP)));

  const nextToMake = (): number | null => {
    const asked = wanted.current.find((i) => !stills.current.has(i));
    if (asked != null) return asked;
    while (nextInOrder.current <= lastIndex && stills.current.has(nextInOrder.current)) nextInOrder.current++;
    return nextInOrder.current <= lastIndex ? nextInOrder.current : null;
  };

  const pump = useCallback(async () => {
    const video = videoRef.current;
    if (busy.current || !ready.current || !video) return;
    busy.current = true;
    for (let i = nextToMake(); i != null && videoRef.current === video; i = nextToMake()) {
      // A frame at exactly 0 often doesn't paint.
      await seek(video, Math.max(0.05, i * STEP));
      if (!video.videoWidth) break;
      const canvas = document.createElement("canvas");
      canvas.width = STILL_WIDTH;
      canvas.height = Math.round((STILL_WIDTH * video.videoHeight) / video.videoWidth);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      stills.current.set(i, canvas);
      setMade((n) => n + 1);
    }
    busy.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastIndex]);

  // Once the hidden copy can show frames: iPad Safari paints a seeked
  // frame only once the video has played, so it's played and paused first.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || duration == null) return;
    const start = () => {
      const begin = () => {
        ready.current = true;
        pump();
      };
      video
        .play()
        .then(() => {
          video.pause();
          begin();
        })
        .catch(begin);
    };
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) start();
    else video.addEventListener("loadedmetadata", start, { once: true });
    return () => video.removeEventListener("loadedmetadata", start);
  }, [duration, pump]);

  // The times asked for are made first.
  const indexes = duration == null ? [] : times.map(indexOf);
  const indexesKey = indexes.join();
  useEffect(() => {
    wanted.current = indexes;
    pump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexesKey, pump]);

  return {
    videoRef,
    stills: times.map((_, n) => (indexes[n] == null ? null : (stills.current.get(indexes[n]) ?? null))),
  };
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener("seeked", done);
      resolve();
    };
    const timer = setTimeout(done, SEEK_TIMEOUT_MS);
    video.addEventListener("seeked", done);
    video.currentTime = time;
  });
}
