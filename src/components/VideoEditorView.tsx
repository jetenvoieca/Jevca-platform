"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  reorderTimeline,
  removeClipFromTimeline,
  clearDraftTimeline,
  setClipDuration,
  setClipTrim,
  initializeClipDuration,
  splitClip,
  addPicksToTimeline,
  setTimelineShape,
  setTimelineMusic,
  setClipStickers,
  setAllPhotoDurations,
  setClipFade,
  setAllClipFades,
  setTimelineVoice,
  setTimelineCaptions,
} from "@/lib/actions/videoEditor";
import VoiceoverControl from "@/components/VoiceoverControl";
import { uploadVoice } from "@/lib/voiceUpload";
import { useBackdropClose } from "@/lib/useBackdropClose";
import CaptionsControl from "@/components/CaptionsControl";
import ClipStickersEditor from "@/components/ClipStickersEditor";
import VideoPreviewPlayer from "@/components/VideoPreviewPlayer";
import type { ClipSticker, StickerRow } from "@/lib/stickers";
import MediaPicker from "@/components/MediaPicker";
import { renderVideo, discardRenderResult } from "@/lib/actions/render";
import VideoThumb from "@/components/VideoThumb";
import TrimScrubber from "@/components/TrimScrubber";
import MediaDetailPanel, { type MediaDetail } from "@/components/MediaDetailPanel";
import {
  totalTimelineSeconds,
  fadeSpeedOf,
  DEFAULT_MUSIC_UNDER_VOICE,
  FADE_SPEEDS,
  VIDEO_SHAPES,
  type FadeSpeed,
  type TimelineCaptions,
  type TimelineClip,
  type TimelineMusic,
  type TimelineVoice,
  type VideoShape,
} from "@/lib/videoTimeline";
import type { MusicTrackRow } from "@/lib/musicTracks";

type ImageInfo = {
  id: string;
  url: string;
  posterUrl: string | null;
  kind: "PHOTO" | "VIDEO";
  caption: string | null;
};
type Clip = TimelineClip & { image: ImageInfo };

type SourceClip = { id: string; kind: "PHOTO" | "VIDEO"; image: ImageInfo };

type RenderStatus = {
  id: string;
  status: "PENDING" | "RENDERING" | "DONE" | "FAILED";
  error: string | null;
  createdAt: string;
  debugPayload: string | null;
  sourceClips: SourceClip[];
  // This render's own clip count/duration (2026-08-18) — see the note by
  // the header below for why this exists separately from the live
  // draft's own clips/totalSeconds.
  clipCount: number;
  totalSeconds: number;
  resultImage: MediaDetail | null;
} | null;

// The three buttons on the right of the header.
const HEADER_BUTTON =
  "w-full rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40";

export default function VideoEditorView({
  siteId,
  artistId,
  renderId,
  initialClips,
  initialShape,
  initialMusic,
  initialMuteClips,
  initialVoice,
  initialCaptions,
  musicTracks,
  stickerLibrary,
  renderStatus: savedRenderStatus,
  tagPresets,
}: {
  siteId: string;
  artistId: string;
  renderId: string;
  initialClips: Clip[];
  initialShape: VideoShape;
  initialMusic: TimelineMusic | null;
  initialMuteClips: boolean;
  initialVoice: TimelineVoice | null;
  initialCaptions: TimelineCaptions | null;
  // The artist's Music library (Media Catalogue → Music).
  musicTracks: MusicTrackRow[];
  // The artist's Stickers library (Media Catalogue → Stickers).
  stickerLibrary: StickerRow[];
  renderStatus: RenderStatus;
  tagPresets: string[];
}) {
  const [clips, setClips] = useState<Clip[]>(initialClips);
  const [shape, setShape] = useState<VideoShape>(initialShape);
  // A render being discarded goes from the page at once (2026-10-16),
  // not after the server has finished and the page has reloaded.
  const [discardedId, setDiscardedId] = useState<string | null>(null);
  const renderStatus = savedRenderStatus && savedRenderStatus.id !== discardedId ? savedRenderStatus : null;

  const changeShape = (next: VideoShape) => {
    setShape(next);
    setTimelineShape(siteId, renderId, next);
  };

  // Music under the whole video (2026-10-16).
  const [music, setMusic] = useState<TimelineMusic | null>(initialMusic);
  const [muteClips, setMuteClips] = useState(initialMuteClips);
  const musicSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeMusic = (nextMusic: TimelineMusic | null, nextMute: boolean) => {
    setMusic(nextMusic);
    setMuteClips(nextMute);
    // Saved shortly after, so dragging the volume doesn't save every step.
    if (musicSaveRef.current) clearTimeout(musicSaveRef.current);
    musicSaveRef.current = setTimeout(() => setTimelineMusic(siteId, renderId, nextMusic, nextMute), 400);
  };
  const musicTrack = music ? (musicTracks.find((t) => t.id === music.trackId) ?? null) : null;

  // The voiceover (2026-10-17): a new recording saves at once; its start
  // and the music level save shortly after changing.
  const [voice, setVoice] = useState<TimelineVoice | null>(initialVoice);
  const voiceSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeVoice = (next: TimelineVoice | null, save: "now" | "soon") => {
    setVoice(next);
    if (voiceSaveRef.current) clearTimeout(voiceSaveRef.current);
    if (save === "now") setTimelineVoice(siteId, renderId, next);
    else voiceSaveRef.current = setTimeout(() => setTimelineVoice(siteId, renderId, next), 400);
  };
  // Recorded over the preview: it starts with the video.
  const saveVoiceOverPreview = async (wav: Blob, durationSeconds: number) => {
    const key = await uploadVoice(artistId, wav, "audio/wav");
    changeVoice(
      {
        key,
        durationSeconds,
        start: 0,
        musicUnderVoice: voice?.musicUnderVoice ?? DEFAULT_MUSIC_UNDER_VOICE,
      },
      "now",
    );
  };
  const initialVoiceKey = JSON.stringify(initialVoice);
  useEffect(() => {
    setVoice(initialVoice);
    // Only when what's saved actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVoiceKey]);

  // Captions (2026-10-17): choices save at once, typing shortly after.
  const [captions, setCaptions] = useState<TimelineCaptions | null>(initialCaptions);
  const captionsSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeCaptions = (next: TimelineCaptions | null, save: "now" | "soon") => {
    setCaptions(next);
    if (captionsSaveRef.current) clearTimeout(captionsSaveRef.current);
    if (save === "now") setTimelineCaptions(siteId, renderId, next);
    else captionsSaveRef.current = setTimeout(() => setTimelineCaptions(siteId, renderId, next), 600);
  };
  const initialCaptionsKey = JSON.stringify(initialCaptions);
  useEffect(() => {
    setCaptions(initialCaptions);
    // Only when what's saved actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCaptionsKey]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [rendering, setRendering] = useState(false);
  // Preview: watching it, or recording a voiceover over it (silent).
  const [previewing, setPreviewing] = useState<"watch" | "record" | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const router = useRouter();

  // Add Media (2026-10-15): media and artworks picked together, added to
  // the end of the video.
  const addPicks = async (picks: { imageIds: string[]; artworkIds: string[] }) => {
    setAddError(null);
    const result = await addPicksToTimeline(artistId, siteId, picks);
    if (!result.ok) setAddError(result.error);
    router.refresh();
  };

  useEffect(() => {
    setClips(initialClips);
  }, [initialClips]);

  useEffect(() => {
    setShape(initialShape);
  }, [initialShape]);

  // Only when what's saved actually changes (a refresh brings a new but
  // equal object).
  const initialMusicKey = JSON.stringify(initialMusic);
  useEffect(() => {
    setMusic(initialMusic);
    setMuteClips(initialMuteClips);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMusicKey, initialMuteClips]);

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

  const totalSeconds = totalTimelineSeconds(clips);

  // 2026-08-18 fix — a completed (or in-progress) render creates a fresh,
  // separate, genuinely empty draft alongside it, so you can start a new
  // video right away. Before this fix, the header always described that
  // new empty draft ("0 clips · 0s total") even while a render with real
  // clips in it was sitting right below — technically accurate for the
  // draft, but confusing next to a render that plainly wasn't empty. Once
  // clips are actually added to the new draft, this reverts to describing
  // that draft, same as before.
  const headerClipCount = clips.length > 0 || !renderStatus ? clips.length : renderStatus.clipCount;
  const headerTotalSeconds = clips.length > 0 || !renderStatus ? totalSeconds : renderStatus.totalSeconds;

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

  const handleClearAll = async () => {
    if (!confirm("Remove every clip from this strip and return them to Sorted media?")) return;
    setClearing(true);
    await clearDraftTimeline(siteId, renderId);
    setClips([]);
    setSelectedId(null);
    setClearing(false);
  };

  const handleDurationChange = (id: string, value: number) => {
    const duration = Math.max(0.1, value);
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, duration } : c)));
    setClipDuration(siteId, renderId, id, duration);
  };

  const handleAllPhotoDurations = (seconds: number) => {
    setClips((prev) => prev.map((c) => (c.kind === "PHOTO" ? { ...c, duration: seconds } : c)));
    setAllPhotoDurations(siteId, renderId, seconds);
  };

  const handleKnownDuration = (id: string, sourceDuration: number) => {
    setClips((prev) =>
      prev.map((c) =>
        c.id === id && c.sourceDuration == null
          ? {
              ...c,
              sourceDuration,
              trimIn: c.trimIn ?? 0,
              trimOut: c.trimOut ?? sourceDuration,
            }
          : c,
      ),
    );
    initializeClipDuration(siteId, renderId, id, sourceDuration);
  };

  const handleTrimChange = (id: string, trimIn: number, trimOut: number) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, trimIn, trimOut } : c)));
    setClipTrim(siteId, renderId, id, trimIn, trimOut);
  };

  // A clip's stickers: shown at once, saved shortly after (so dragging a
  // size doesn't save every step).
  const stickerSaves = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const handleStickersChange = (id: string, stickers: ClipSticker[]) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, stickers } : c)));
    clearTimeout(stickerSaves.current.get(id));
    stickerSaves.current.set(
      id,
      setTimeout(() => setClipStickers(siteId, renderId, id, stickers), 400),
    );
  };

  // How a clip changes into the next one (2026-10-17).
  const handleFadeChange = (id: string, fade: FadeSpeed) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, fade } : c)));
    setClipFade(siteId, renderId, id, fade);
  };
  const handleAllFades = (fade: FadeSpeed) => {
    setClips((prev) => prev.map((c) => ({ ...c, fade })));
    setAllClipFades(siteId, renderId, fade);
  };

  // The selected clip's stickers, in a pop-up (2026-10-17).
  const [stickersOpen, setStickersOpen] = useState(false);
  const closeStickers = () => setStickersOpen(false);
  const stickersBackdrop = useBackdropClose(closeStickers);

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
    setDiscardedId(statusId);
    setDiscarding(true);
    await discardRenderResult(siteId, statusId);
    setDiscarding(false);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-4">
      {/* Sticky, per the standing "fixed headers, independently-scrolling
          columns" layout rule (2026-08-03) — this page's own title/Render
          bar stays visible while the clip strip and editor below scroll
          underneath it, same as Media Catalogue's header. The negative
          margin/padding pair cancels this wrapper's own px-6/py-4 so the
          bar sits flush against the scrolling column's real edges once
          stuck, rather than leaving a gap content can peek through. */}
      <div className="sticky top-0 z-10 -mx-6 -mt-4 mb-4 border-b border-neutral-200 bg-white px-6 pb-4 pt-4">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-neutral-900">Video Editor</h1>
            <p className="text-sm text-neutral-500">
              {headerClipCount} clip{headerClipCount === 1 ? "" : "s"} · {formatTotal(headerTotalSeconds)} total
              {clips.length > 0 && totalSeconds > 90 && (
                <span className="ml-2 text-amber-600">— over the 90s target</span>
              )}
              {clips.length > 0 && (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={handleClearAll}
                    disabled={clearing}
                    className="text-neutral-400 underline hover:text-neutral-700 disabled:opacity-50"
                  >
                    {clearing ? "Clearing…" : "Clear all"}
                  </button>
                </>
              )}
            </p>
            {/* The whole video's settings (tidied 2026-10-17): shape,
                voiceover, captions, music — hidden while a render is open,
                like Add Media: one video at a time. */}
            {!renderStatus && (
              <div className="mt-3 space-y-3 text-sm text-neutral-600">
                {/* Upright for Reels and Stories, portrait or square for the feed. */}
                <div className="flex w-fit overflow-hidden rounded-full border border-neutral-300">
                  {VIDEO_SHAPES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => changeShape(s.value)}
                      className={`px-4 py-1 font-medium ${
                        shape === s.value
                          ? "bg-neutral-900 text-white"
                          : "bg-white text-neutral-700 hover:bg-neutral-50"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <VoiceoverControl
                  artistId={artistId}
                  voice={voice}
                  totalSeconds={totalSeconds}
                  hasMusic={!!music}
                  canRecordOverPreview={clips.length > 0}
                  onRecordOverPreview={() => setPreviewing("record")}
                  onChange={changeVoice}
                />
                <CaptionsControl
                  captions={captions}
                  hasVoice={!!voice}
                  totalSeconds={totalSeconds}
                  onChange={changeCaptions}
                />
                {/* One track from the Music library under the whole video,
                    fading in and out. */}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2">
                    Music
                    <select
                      value={music?.trackId ?? ""}
                      onChange={(e) =>
                        changeMusic(
                          e.target.value
                            ? {
                                trackId: e.target.value,
                                volume: music?.volume ?? 0.8,
                              }
                            : null,
                          muteClips,
                        )
                      }
                      className="max-w-64 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                    >
                      <option value="">None</option>
                      {musicTracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {musicTracks.length === 0 && (
                    <a href={`/sites/${siteId}/media?purpose=music`} className="text-xs text-neutral-400 underline">
                      Add music in the Media Catalogue
                    </a>
                  )}
                  {music && (
                    <>
                      <label className="flex items-center gap-2">
                        Volume
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={music.volume}
                          onChange={(e) => changeMusic({ ...music, volume: Number(e.target.value) }, muteClips)}
                        />
                        <span className="w-9 text-xs text-neutral-400">{Math.round(music.volume * 100)}%</span>
                      </label>
                      {musicTrack && <audio src={musicTrack.url} controls preload="none" className="h-8" />}
                    </>
                  )}
                </div>
                <label className="flex w-fit items-center gap-2">
                  <input type="checkbox" checked={muteClips} onChange={(e) => changeMusic(music, e.target.checked)} />
                  Mute the clips&apos; own sound
                </label>
              </div>
            )}
          </div>
          <div className="flex w-40 flex-shrink-0 flex-col gap-2">
            {!renderStatus && (
              <MediaPicker
                artistId={artistId}
                siteId={siteId}
                mode="multi"
                mediaKinds={["PHOTO", "VIDEO"]}
                variant="button"
                label="Add Media"
                buttonClassName={HEADER_BUTTON}
                withArtworks
                onSelect={(images, artworks) =>
                  addPicks({
                    imageIds: images.map((i) => i.id),
                    artworkIds: artworks.map((a) => a.id),
                  })
                }
              />
            )}
            {!renderStatus && (
              <button
                type="button"
                onClick={() => setPreviewing("watch")}
                disabled={clips.length === 0}
                className={HEADER_BUTTON}
              >
                Preview
              </button>
            )}
            <button
              type="button"
              onClick={handleRenderClick}
              disabled={clips.length === 0 || rendering || blockedByUnresolvedRender}
              className={HEADER_BUTTON}
            >
              {rendering ? "Sending…" : "Render"}
            </button>
            {/* A genuine error shows here; a greyed-out Render needs no
                explanation (2026-08-18). */}
            {renderError && <p className="text-xs text-red-600">{renderError}</p>}
            {addError && <p className="text-xs text-red-600">{addError}</p>}
          </div>
        </div>
      </div>

      {renderStatus && (
        <div className="mb-6 max-w-md">
          {renderStatus.sourceClips.length > 0 && (
            <div className="mb-3">
              <p className="mb-2 text-xs font-medium text-neutral-500">
                Clips used in this render — check against what you uploaded:
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {renderStatus.sourceClips.map((clip) => (
                  <div key={clip.id} className="w-16 flex-shrink-0">
                    {clip.kind === "VIDEO" ? (
                      clip.image.posterUrl ? (
                        <img
                          src={clip.image.posterUrl}
                          alt=""
                          className="aspect-square w-full rounded-md object-cover"
                        />
                      ) : (
                        <VideoThumb src={clip.image.url} className="aspect-square w-full rounded-md object-cover" />
                      )
                    ) : (
                      <img src={clip.image.url} alt="" className="aspect-square w-full rounded-md object-cover" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {renderStatus.status === "PENDING" || renderStatus.status === "RENDERING" ? (
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              {/* Pulses (2026-08-18, direct request) — this can sit here
                  for a minute or two with nothing else on the page
                  visibly changing (it polls every 4s via the effect
                  above, but router.refresh() alone gives no visual cue
                  in between), so a static sentence risked looking stalled
                  or broken rather than genuinely still working. */}
              <p className="animate-pulse text-sm text-neutral-600">
                Rendering your video… this can take a minute or two.
              </p>
            </div>
          ) : renderStatus.status === "FAILED" ? (
            <div className="rounded-lg border border-red-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-red-600">Render failed</p>
                <button
                  type="button"
                  onClick={() => handleDiscard(renderStatus.id)}
                  disabled={discarding}
                  className="text-xs text-neutral-500 underline hover:text-neutral-800 disabled:opacity-50"
                >
                  {discarding ? "Discarding…" : "Discard"}
                </button>
              </div>
              {renderStatus.error && <p className="text-sm text-red-600">{renderStatus.error}</p>}
            </div>
          ) : renderStatus.status === "DONE" && renderStatus.resultImage ? (
            <MediaDetailPanel
              key={renderStatus.resultImage.id}
              siteId={siteId}
              media={renderStatus.resultImage}
              tagPresets={tagPresets}
              variant="pendingRender"
              onDiscard={() => handleDiscard(renderStatus.id)}
              discarding={discarding}
            />
          ) : null}

          {renderStatus.debugPayload && <DebugPayload json={renderStatus.debugPayload} />}
        </div>
      )}

      {/* Hidden entirely, not just disabled, while a render is
          pending or unresolved — reconfirmed 2026-08-09: this must not
          even appear to invite starting a second video until the
          current one is Saved or Discarded. Same editor UI as always,
          just conditionally rendered — not dead code, not CSS-hidden. */}
      {!renderStatus && (
        <>
          {clips.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-400">
              Nothing here yet — use Add Media to choose the pictures and videos.
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
                    {(clip.stickers?.length ?? 0) > 0 && <span title="Stickers">★ </span>}
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
              <h2 className="mb-2 text-base text-neutral-800">
                {selected.image.caption || (selected.kind === "PHOTO" ? "Photo" : "Video")}
              </h2>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                {selected.kind === "PHOTO" ? (
                  <img src={selected.image.url} alt="" className="mb-4 max-h-64 w-full rounded-md object-contain" />
                ) : (
                  <div className="mb-4">
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
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-600">
                  {selected.kind === "PHOTO" && (
                    <label className="flex items-center gap-2">
                      On screen for
                      <DurationInput
                        key={selected.id}
                        value={selected.duration ?? 2}
                        onChange={(seconds) => handleDurationChange(selected.id, seconds)}
                      />
                      seconds
                      <button
                        type="button"
                        onClick={() => handleAllPhotoDurations(selected.duration ?? 2)}
                        className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
                      >
                        All photos
                      </button>
                    </label>
                  )}
                  {/* How this clip changes into the next — none after the last. */}
                  {selected.id !== clips[clips.length - 1]?.id && (
                    <div className="flex items-center gap-2" title="How this clip changes into the next one">
                      Fade
                      <div className="flex overflow-hidden rounded-full border border-neutral-300">
                        {FADE_SPEEDS.map((f) => (
                          <button
                            key={f.value}
                            type="button"
                            onClick={() => handleFadeChange(selected.id, f.value)}
                            className={`px-3 py-1 font-medium ${
                              fadeSpeedOf(selected.fade).value === f.value
                                ? "bg-neutral-900 text-white"
                                : "bg-white text-neutral-700 hover:bg-neutral-50"
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAllFades(fadeSpeedOf(selected.fade).value)}
                        className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
                      >
                        All clips
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setStickersOpen(true)}
                    className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
                  >
                    {(selected.stickers?.length ?? 0) > 0 ? `Stickers (${selected.stickers!.length})` : "Add Sticker"}
                  </button>
                </div>
              </div>

              {stickersOpen && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
                  {...stickersBackdrop}
                >
                  <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl">
                    <ClipStickersEditor
                      key={`stickers-${selected.id}`}
                      siteId={siteId}
                      frame={selected.image}
                      shape={shape}
                      library={stickerLibrary}
                      stickers={selected.stickers ?? []}
                      onChange={(stickers) => handleStickersChange(selected.id, stickers)}
                    />
                    <div className="flex justify-end px-4 pb-4">
                      <button
                        type="button"
                        onClick={closeStickers}
                        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {previewing && (
        <VideoPreviewPlayer
          clips={clips}
          shape={shape}
          // Recording over it, the preview plays silently.
          music={previewing === "watch" && musicTrack && music ? { url: musicTrack.url, volume: music.volume } : null}
          muteClips={previewing === "record" || muteClips}
          voice={previewing === "watch" && voice ? { ...voice, url: `/api/media/${voice.key}` } : null}
          captions={captions}
          stickerLibrary={stickerLibrary}
          recordVoice={previewing === "record" ? saveVoiceOverPreview : undefined}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}

// A photo's seconds on screen (2026-10-16). Typed freely — clearing the
// box to type a new number used to snap it straight to 0.1 — and taken
// once it's a number of at least 0.1; left with anything else, it goes
// back to the last good value.
function DurationInput({ value, onChange }: { value: number; onChange: (seconds: number) => void }) {
  const [text, setText] = useState(String(value));
  const commit = () => {
    const seconds = Number(text.replace(",", "."));
    if (Number.isFinite(seconds) && seconds >= 0.1) {
      onChange(seconds);
      setText(String(seconds));
    } else {
      setText(String(value));
    }
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const seconds = Number(e.target.value.replace(",", "."));
        if (Number.isFinite(seconds) && seconds >= 0.1) onChange(seconds);
      }}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm"
    />
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
    <div className="mt-3 border-t border-neutral-200 pt-3">
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
          <pre className="max-h-64 overflow-auto rounded-md bg-neutral-900 p-3 text-xs text-neutral-100">{json}</pre>
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
