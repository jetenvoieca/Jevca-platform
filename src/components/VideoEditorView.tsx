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
import {
  renderVideo,
  discardRenderResult,
  discardAllPreviousRenders,
} from "@/lib/actions/render";
import VideoThumb from "@/components/VideoThumb";
import TrimScrubber from "@/components/TrimScrubber";
import MediaDetailPanel, { type MediaDetail } from "@/components/MediaDetailPanel";
import { CROSSFADE_SECONDS, type TimelineClip } from "@/lib/videoTimeline";

type ImageInfo = {
  id: string;
  url: string;
  posterUrl: string | null;
  kind: "PHOTO" | "VIDEO";
  caption: string | null;
};
type Clip = TimelineClip & { image: ImageInfo };

type RenderStatus = {
  id: string;
  status: "PENDING" | "RENDERING" | "DONE" | "FAILED";
  error: string | null;
  createdAt: string;
  queueCount: number;
  debugPayload: string | null;
  resultImage: MediaDetail | null;
} | null;

function clipLength(c: Clip): number {
  return c.kind === "PHOTO" ? c.duration ?? 2 : Math.max(0, (c.trimOut ?? 0) - (c.trimIn ?? 0));
}

export default function VideoEditorView({
  siteId,
  renderId,
  initialClips,
  renderStatus,
  tagPresets,
  artistArtworks,
}: {
  siteId: string;
  renderId: string;
  initialClips: Clip[];
  renderStatus: RenderStatus;
  tagPresets: string[];
  artistArtworks: { id: string; presentationTitle: string }[];
}) {
  const [clips, setClips] = useState<Clip[]>(initialClips);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setClips(initialClips);
  }, [initialClips]);

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
      reorderTimeline(siteId, renderId, idsKey.split(",").filter(Boolean));
    }, 500);
    return () => {
      if (reorderDebounce.current) clearTimeout(reorderDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    if (!renderStatus) return;
    if (renderStatus.status !== "PENDING" && renderStatus.status !== "RENDERING") return;
    const interval = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderStatus?.status]);

  const selected = clips.find((c) => c.id === selectedId) ?? null;

  const totalSeconds = clips.reduce((sum, c, i) => {
    const length = clipLength(c);
    const isLast = i === clips.length - 1;
    const overlap = isLast ? 0 : Math.min(CROSSFADE_SECONDS, length, clipLength(clips[i + 1]));
    return sum + length - overlap;
  }, 0);

  const blockedByUnresolvedRender =
    renderStatus != null && (renderStatus.status === "DONE" || renderStatus.status === "FAILED");

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

  const handleRenderClick = async () => {
    setRendering(true);
    setRenderError(null);
    const result = await renderVideo(siteId, renderId);
    setRendering(false);
    if (!result.ok) {
      setRenderError(result.error);
      return;
    }
    router.refresh();
  };

  const [discarding, setDiscarding] = useState(false);
  const handleDiscard = async (statusId: string) => {
    if (!confirm("Discard this render? This can't be undone.")) return;
    setDiscarding(true);
    await discardRenderResult(siteId, statusId);
    setDiscarding(false);
    router.refresh();
  };

  const [discardingAll, setDiscardingAll] = useState(false);
  const handleDiscardAll = async () => {
    if (!confirm("Discard every previous unnamed/failed render? This can't be undone.")) return;
    setDiscardingAll(true);
    await discardAllPreviousRenders(siteId, renderId);
    setDiscardingAll(false);
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
        <div className="text-right">
          <button
            type="button"
            onClick={handleRenderClick}
            disabled={clips.length === 0 || rendering || blockedByUnresolvedRender}
            title={blockedByUnresolvedRender ? "Save or discard the render below first" : undefined}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
          >
            {rendering ? "Sending…" : "Render Video"}
          </button>
          {renderError && <p className="mt-1 max-w-xs text-xs text-red-600">{renderError}</p>}
          {blockedByUnresolvedRender && !renderError && (
            <p className="mt-1 max-w-xs text-xs text-amber-600">
              Save or discard the render below first
            </p>
          )}
        </div>
      </div>

      {renderStatus && (
        <div className="mb-6 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
              Rendered {new Date(renderStatus.createdAt).toLocaleString()}
            </p>
            <button
              type="button"
              onClick={() => handleDiscard(renderStatus.id)}
              disabled={discarding}
              className="text-xs text-neutral-500 underline hover:text-neutral-800 disabled:opacity-50"
            >
              {discarding ? "Discarding…" : "Discard this render"}
            </button>
          </div>

          {renderStatus.queueCount > 1 && (
            <p className="mb-2 text-xs text-amber-700">
              {renderStatus.queueCount} previous renders are queued up — discarding this one
              will reveal the next.{" "}
              <button
                type="button"
                onClick={handleDiscardAll}
                disabled={discardingAll}
                className="underline hover:text-amber-900 disabled:opacity-50"
              >
                {discardingAll ? "Clearing…" : "Discard all of them at once"}
              </button>
            </p>
          )}

          {renderStatus.status === "PENDING" || renderStatus.status === "RENDERING" ? (
            <p className="text-sm text-neutral-600">
              Rendering your video… this can take a minute or two. Feel free to keep working —
              this will update on its own.
            </p>
          ) : renderStatus.status === "FAILED" ? (
            <p className="text-sm text-red-600">
              Render failed{renderStatus.error ? `: ${renderStatus.error}` : "."}
            </p>
          ) : renderStatus.status === "DONE" && renderStatus.resultImage ? (
            <>
              <p className="mb-2 text-sm font-medium text-neutral-700">
                Your video is ready — name and describe it below to save it to the Media
                Catalogue:
              </p>
              <MediaDetailPanel
                siteId={siteId}
                media={renderStatus.resultImage}
                tagPresets={tagPresets}
                artistArtworks={artistArtworks}
                hideActions
              />
            </>
          ) : null}

          {renderStatus.debugPayload && <DebugPayload json={renderStatus.debugPayload} />}
        </div>
      )}

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

function DebugPayload({ json }: { json: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mt-3 border-t border-amber-200 pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-neutral-500 underline hover:text-neutral-800"
      >
        {open ? "Hide technical details" : "Show technical details"}
      </button>
      {open && (
        <div className="mt-2">
          <button
            type="button"
            onClick={handleCopy}
            className="mb-1 rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <pre className="max-h-64 overflow-auto rounded-md bg-neutral-900 p-3 text-xs text-neutral-100">
            {json}
          </pre>
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
