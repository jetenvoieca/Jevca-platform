"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  reorderTimeline,
  removeClipFromTimeline,
  setClipDuration,
  setClipTrim,
  initializeClipDuration,
  splitClip,
} from "@/lib/actions/videoEditor";
import VideoThumb from "@/components/VideoThumb";
import TrimScrubber from "@/components/TrimScrubber";
import type { TimelineClip } from "@/lib/videoTimeline";

type ImageInfo = {
  id: string;
  url: string;
  posterUrl: string | null;
  kind: "PHOTO" | "VIDEO";
  caption: string | null;
};
type Clip = TimelineClip & { image: ImageInfo };

export default function VideoEditorView({
  siteId,
  renderId,
  initialClips,
}: {
  siteId: string;
  renderId: string;
  initialClips: Clip[];
}) {
  const [clips, setClips] = useState<Clip[]>(initialClips);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const router = useRouter();

  // Resyncs after a router.refresh() (used after a split, which creates
  // new clip ids the client can't derive on its own).
  useEffect(() => {
    setClips(initialClips);
  }, [initialClips]);

  // Debounced reorder save — same "change locally, persist a moment
  // later" pattern used for autosave elsewhere in this app.
  const idsKey = clips.map((c) => c.id).join(",");
  const isFirstRun = useRef(true);
  const reorderDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    if (reorderDebounce.current) clearTimeout(reorderDebounce.current);
    reorderDebounce.current = setTimeout(() => {
      reorderTimeline(
        siteId,
        renderId,
        idsKey.split(",").filter(Boolean)
      );
    }, 500);
    return () => {
      if (reorderDebounce.current) clearTimeout(reorderDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const selected = clips.find((c) => c.id === selectedId) ?? null;

  const totalSeconds = clips.reduce((sum, c) => {
    if (c.kind === "PHOTO") return sum + (c.duration ?? 2);
    const inS = c.trimIn ?? 0;
    const outS = c.trimOut ?? inS;
    return sum + Math.max(0, outS - inS);
  }, 0);

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) return;
    setClips((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
  };

  const handleRemove = (id: string) => {
    removeClipFromTimeline(siteId, renderId, id);
    setClips((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleDurationChange = (id: string, value: number) => {
    const duration = Math.max(0.1, value);
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, duration } : c)));
    setClipDuration(siteId, renderId, id, duration);
  };

  const handleKnownDuration = (id: string, sourceDuration: number) => {
    setClips((prev) =>
      prev.map((c) =>
        c.id === id && c.sourceDuration == null
          ? { ...c, sourceDuration, trimIn: c.trimIn ?? 0, trimOut: c.trimOut ?? sourceDuration }
          : c
      )
    );
    initializeClipDuration(siteId, renderId, id, sourceDuration);
  };

  const handleTrimChange = (id: string, trimIn: number, trimOut: number) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, trimIn, trimOut } : c)));
    setClipTrim(siteId, renderId, id, trimIn, trimOut);
  };

  const handleSplit = async (id: string, cutStart: number, cutEnd: number) => {
    await splitClip(siteId, renderId, id, cutStart, cutEnd);
    setSelectedId(null);
    router.refresh();
  };

  return (
    <div className="px-6 py-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Video Editor</h1>
          <p className="text-sm text-neutral-500">
            {clips.length} clip{clips.length === 1 ? "" : "s"} · {formatTotal(totalSeconds)} total
            {totalSeconds > 90 && <span className="ml-2 text-amber-600">— over the 90s target</span>}
          </p>
        </div>
        <button
          type="button"
          disabled
          title="Shotstack isn't set up yet — coming next"
          className="cursor-not-allowed rounded-md bg-neutral-200 px-4 py-2 text-sm font-medium text-neutral-400"
        >
          Render Video
        </button>
      </div>

      {clips.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-400">
          Nothing here yet — add items from the Hopper.
        </div>
      ) : (
        <div className="mb-6 flex gap-3 overflow-x-auto pb-2">
          {clips.map((clip, i) => (
            <div
              key={clip.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => setDragIndex(null)}
              onClick={() => setSelectedId(clip.id)}
              className={`group relative w-32 flex-shrink-0 cursor-pointer rounded-lg border-2 p-1 ${
                selectedId === clip.id
                  ? "border-neutral-900"
                  : dragIndex === i
                  ? "border-neutral-900 opacity-50"
                  : "border-transparent"
              }`}
            >
              {clip.kind === "VIDEO" ? (
                clip.image.posterUrl ? (
                  <img src={clip.image.posterUrl} alt="" className="aspect-square w-full rounded-md object-cover" />
                ) : (
                  <VideoThumb src={clip.image.url} className="aspect-square w-full rounded-md object-cover" />
                )
              ) : (
                <img src={clip.image.url} alt="" className="aspect-square w-full rounded-md object-cover" />
              )}
              <div className="mt-1 truncate text-center text-xs text-neutral-500">
                {clip.kind === "PHOTO"
                  ? `${(clip.duration ?? 2).toFixed(1)}s`
                  : clip.trimIn != null && clip.trimOut != null
                  ? `${(clip.trimOut - clip.trimIn).toFixed(1)}s`
                  : "…"}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(clip.id);
                }}
                className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-xs text-white group-hover:flex"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-neutral-700">
            {selected.image.caption || (selected.kind === "PHOTO" ? "Photo" : "Video")}
          </h2>

          {selected.kind === "PHOTO" ? (
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <img src={selected.image.url} alt="" className="mb-3 max-h-64 w-full rounded-md object-contain" />
              <label className="flex items-center gap-2 text-sm text-neutral-600">
                On screen for
                <input
                  type="number"
                  step={0.1}
                  min={0.1}
                  value={selected.duration ?? 2}
                  onChange={(e) => handleDurationChange(selected.id, Number(e.target.value))}
                  className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                seconds
              </label>
            </div>
          ) : (
            <TrimScrubber
              key={selected.id}
              videoUrl={selected.image.url}
              trimIn={selected.trimIn ?? 0}
              trimOut={selected.trimOut ?? selected.sourceDuration ?? 0}
              sourceDuration={selected.sourceDuration ?? null}
              onKnownDuration={(d) => handleKnownDuration(selected.id, d)}
              onTrimChange={(inS, outS) => handleTrimChange(selected.id, inS, outS)}
              onSplit={(start, end) => handleSplit(selected.id, start, end)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function formatTotal(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
