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
  grabVideoStill,
} from "@/lib/actions/videoEditor";
import VoiceoverControl from "@/components/VoiceoverControl";
import { uploadVoice } from "@/lib/voiceUpload";
import { useBackdropClose } from "@/lib/useBackdropClose";
import CaptionsControl from "@/components/CaptionsControl";
import ClipStickersEditor from "@/components/ClipStickersEditor";
import VideoPreviewPlayer from "@/components/VideoPreviewPlayer";
import { stickerPreviewStyle, type ClipSticker, type StickerRow } from "@/lib/stickers";
import MediaPicker from "@/components/MediaPicker";
import { renderVideo, discardRenderResult, nameRenderedVideo } from "@/lib/actions/render";
import { createReelFromVideo } from "@/lib/actions/socialPosts";
import MusicControl from "@/components/MusicControl";
import { MENU_BUTTON, MENU_BUTTON_ACTIVE } from "@/components/videoEditorUi";
import VideoThumb from "@/components/VideoThumb";
import TrimScrubber from "@/components/TrimScrubber";
import MediaDetailPanel, { type MediaDetail } from "@/components/MediaDetailPanel";
import {
  totalTimelineSeconds,
  fadeSpeedOf,
  DEFAULT_MUSIC_UNDER_VOICE,
  FADE_SPEEDS,
  VIDEO_SHAPES,
  videoSize,
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

// What the centre panel shows, chosen in the menu.
type Panel = "media" | "voice" | "captions" | "music" | "preview" | "record";

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
  // The centre panel — Preview, or recording a voiceover over it (silent).
  const [panel, setPanel] = useState<Panel | null>(null);
  const togglePanel = (next: Panel) =>
    setPanel((open) => (open === next || (next === "preview" && open === "record") ? null : next));
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
  // The selected clip shows at the video's shape, with its stickers.
  const frameAspect = `${videoSize(shape).width} / ${videoSize(shape).height}`;
  const selectedStickers = (selected?.stickers ?? []).map((s) => {
    const sticker = stickerLibrary.find((l) => l.id === s.stickerId);
    return sticker ? <img key={s.id} src={sticker.url} alt="" style={stickerPreviewStyle(s.position, s.size)} /> : null;
  });

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

  // Clear (2026-10-17): abandons this video and starts afresh — no
  // clips, voiceover, captions or music, square again.
  const handleClear = async () => {
    if (!confirm("Clear this video and start afresh? The clips, voiceover, captions and music are all removed."))
      return;
    setClearing(true);
    // Changes still waiting to save would bring things back.
    for (const timer of [musicSaveRef.current, voiceSaveRef.current, captionsSaveRef.current]) {
      if (timer) clearTimeout(timer);
    }
    stickerSaves.current.forEach((timer) => clearTimeout(timer));
    stickerSaves.current.clear();
    setPanel(null);
    setSelectedId(null);
    setClips([]);
    setShape("square");
    setMusic(null);
    setMuteClips(false);
    setVoice(null);
    setCaptions(null);
    await clearDraftTimeline(siteId, renderId);
    setClearing(false);
    router.refresh();
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
    setPanel(null);
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
    if (!confirm("Delete this rendered video? This can't be undone.")) return;
    setDiscardedId(statusId);
    setDiscarding(true);
    await discardRenderResult(siteId, statusId);
    setDiscarding(false);
    router.refresh();
  };

  // The rendered video, kept in the Media Catalogue (Videos) under the
  // name asked for on saving (2026-10-17) — and, for Social, a new Reel
  // draft with it opened on the Social page. Either frees the editor for
  // the next. The name starts as its Caption, if one's been typed.
  const renderCaptionRef = useRef<HTMLInputElement>(null);
  const [savingRender, setSavingRender] = useState(false);
  const [naming, setNaming] = useState<"social" | "catalogue" | null>(null);
  const [renderName, setRenderName] = useState("");
  const askName = (for_: "social" | "catalogue") => {
    setRenderName(renderCaptionRef.current?.value ?? "");
    setNaming(for_);
  };
  const saveRender = async (thenPost: boolean, name: string) => {
    const result = renderStatus?.resultImage;
    if (!result) return;
    setNaming(null);
    setSavingRender(true);
    await nameRenderedVideo(siteId, result.id, name);
    if (thenPost) {
      const postId = await createReelFromVideo(result.id);
      router.push(`/sites/${siteId}/marketing/social${postId ? `?post=${postId}` : ""}`);
      return;
    }
    setSavingRender(false);
    router.refresh();
  };

  // One video at a time: while a render is open, only its own choices
  // (save, post, delete) are offered.
  const editing = !renderStatus;
  const renderDone = renderStatus?.status === "DONE" && !!renderStatus.resultImage;
  const renderBusy = savingRender || discarding;

  const menuButton = (label: string, opens: Panel, disabled = false) => (
    <button
      type="button"
      onClick={() => togglePanel(opens)}
      disabled={disabled}
      className={panel === opens || (opens === "preview" && panel === "record") ? MENU_BUTTON_ACTIVE : MENU_BUTTON}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-4">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-neutral-900">Video Editor</h1>
        <p className="text-sm text-neutral-500">
          {headerClipCount} clip{headerClipCount === 1 ? "" : "s"} · {formatTotal(headerTotalSeconds)} total
        </p>
        {clips.length > 0 && totalSeconds > 90 && <p className="text-xs text-amber-600">Over the 90s target</p>}
      </header>

      {/* The menu (2026-10-17 layout, Craig's mockup): every option down
          the left; Add Media, Voice over, Captions, Music and Preview open
          the centre panel above the clips. The menu's top lines up with the
          panel's (or the clips'). Stays put while the page scrolls. */}
      <div className="flex gap-8">
        <aside className="sticky top-4 w-56 flex-shrink-0 self-start">
          {/* Upright for Reels and Stories, portrait or square for the feed. */}
          <div
            className={`flex w-full overflow-hidden rounded-full border border-neutral-300 text-xs ${
              editing ? "" : "pointer-events-none opacity-40"
            }`}
          >
            {VIDEO_SHAPES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => changeShape(s.value)}
                className={`flex-1 whitespace-nowrap px-2 py-1.5 font-medium ${
                  shape === s.value ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <nav className="mt-3 flex flex-col gap-2">
            {menuButton("Add Media", "media", !editing)}
            {menuButton("Voice over", "voice", !editing)}
            {menuButton("Captions", "captions", !editing)}
            {menuButton("Music", "music", !editing)}
            {menuButton("Preview", "preview", !editing || clips.length === 0)}
            <button
              type="button"
              onClick={handleRenderClick}
              disabled={clips.length === 0 || rendering || blockedByUnresolvedRender}
              className={MENU_BUTTON}
            >
              {rendering ? "Sending…" : "Render"}
            </button>
            <button
              type="button"
              onClick={() => askName("social")}
              disabled={!renderDone || renderBusy}
              className={MENU_BUTTON}
            >
              Save to social
            </button>
            <button
              type="button"
              onClick={() => askName("catalogue")}
              disabled={!renderDone || renderBusy}
              className={MENU_BUTTON}
            >
              {savingRender ? "Saving…" : "Save to Catalogue"}
            </button>
            <button
              type="button"
              onClick={() => renderStatus && handleDiscard(renderStatus.id)}
              disabled={!blockedByUnresolvedRender || renderBusy}
              className={MENU_BUTTON}
            >
              {discarding ? "Deleting…" : "Delete"}
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={!editing || clearing || (clips.length === 0 && !voice && !captions && !music)}
              className={`mt-3 ${MENU_BUTTON}`}
            >
              {clearing ? "Clearing…" : "Clear"}
            </button>
          </nav>
          {naming && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (renderName.trim()) saveRender(naming === "social", renderName.trim());
                }}
                className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
              >
                <h2 className="text-base font-medium text-neutral-900">Name this video</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  How it's known in the Media Catalogue{naming === "social" ? " and on the Social page" : ""}.
                </p>
                <input
                  type="text"
                  value={renderName}
                  onChange={(e) => setRenderName(e.target.value)}
                  maxLength={200}
                  autoFocus
                  placeholder="e.g. RUDE in motion"
                  className="mt-4 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setNaming(null)}
                    className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!renderName.trim()}
                    className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
                  >
                    {naming === "social" ? "Save and go to Social" : "Save to Catalogue"}
                  </button>
                </div>
              </form>
            </div>
          )}
          {renderError && <p className="mt-2 text-xs text-red-600">{renderError}</p>}
          {addError && <p className="mt-2 text-xs text-red-600">{addError}</p>}
        </aside>

        <main className="min-w-0 flex-1">
          {/* The centre panel: the option chosen in the menu — or, while a
            render is open, the render. */}
          {renderStatus ? (
            <CentrePanel title="Rendered video">
              {renderStatus.status === "PENDING" || renderStatus.status === "RENDERING" ? (
                // Pulses (2026-08-18): this can take a minute or two with
                // nothing else changing (it checks every 4s).
                <p className="animate-pulse text-sm text-neutral-600">
                  Rendering your video… this can take a minute or two.
                </p>
              ) : renderStatus.status === "FAILED" ? (
                <div>
                  <p className="text-sm font-medium text-red-600">Render failed — Delete it to try again.</p>
                  {renderStatus.error && <p className="mt-1 text-sm text-red-600">{renderStatus.error}</p>}
                </div>
              ) : renderStatus.resultImage ? (
                <div className="max-w-md">
                  <MediaDetailPanel
                    key={renderStatus.resultImage.id}
                    siteId={siteId}
                    media={renderStatus.resultImage}
                    tagPresets={tagPresets}
                    variant="pendingRender"
                    captionRef={renderCaptionRef}
                  />
                </div>
              ) : null}
              {renderStatus.debugPayload && <DebugPayload json={renderStatus.debugPayload} />}
            </CentrePanel>
          ) : panel === "media" ? (
            <CentrePanel title="Add Media" onClose={() => setPanel(null)}>
              <MediaPicker
                artistId={artistId}
                siteId={siteId}
                mode="multi"
                mediaKinds={["PHOTO", "VIDEO"]}
                variant="inline"
                withArtworks
                onClose={() => setPanel(null)}
                onSelect={(images, artworks) =>
                  addPicks({ imageIds: images.map((i) => i.id), artworkIds: artworks.map((a) => a.id) })
                }
              />
            </CentrePanel>
          ) : panel === "voice" ? (
            <CentrePanel title="Voice over" onClose={() => setPanel(null)}>
              <VoiceoverControl
                artistId={artistId}
                voice={voice}
                totalSeconds={totalSeconds}
                hasMusic={!!music}
                canRecordOverPreview={clips.length > 0}
                onRecordOverPreview={() => setPanel("record")}
                onChange={changeVoice}
              />
            </CentrePanel>
          ) : panel === "captions" ? (
            <CentrePanel title="Captions" onClose={() => setPanel(null)}>
              <CaptionsControl
                captions={captions}
                hasVoice={!!voice}
                totalSeconds={totalSeconds}
                onChange={changeCaptions}
              />
            </CentrePanel>
          ) : panel === "music" ? (
            <CentrePanel title="Music" onClose={() => setPanel(null)}>
              <MusicControl
                siteId={siteId}
                tracks={musicTracks}
                music={music}
                muteClips={muteClips}
                onChange={changeMusic}
              />
            </CentrePanel>
          ) : panel === "preview" || panel === "record" ? (
            <CentrePanel
              title={panel === "record" ? "Record over the preview" : "Preview"}
              onClose={() => setPanel(null)}
            >
              <VideoPreviewPlayer
                key={panel}
                clips={clips}
                shape={shape}
                // Recording over it, the preview plays silently.
                music={
                  panel === "preview" && musicTrack && music ? { url: musicTrack.url, volume: music.volume } : null
                }
                muteClips={panel === "record" || muteClips}
                voice={panel === "preview" && voice ? { ...voice, url: `/api/media/${voice.key}` } : null}
                captions={captions}
                stickerLibrary={stickerLibrary}
                recordVoice={panel === "record" ? saveVoiceOverPreview : undefined}
                onClose={() => setPanel("voice")}
              />
            </CentrePanel>
          ) : null}

          {/* The clips — while a render is open, the ones that went into it. */}
          {renderStatus ? (
            renderStatus.sourceClips.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-neutral-500">Clips used in this render</p>
                <div className="mb-6 flex gap-3 overflow-x-auto pb-2">
                  {renderStatus.sourceClips.map((clip) => (
                    <div key={clip.id} className="w-32 flex-shrink-0 p-1">
                      <ClipThumb kind={clip.kind} image={clip.image} />
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : clips.length === 0 ? (
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
                  <ClipThumb kind={clip.kind} image={clip.image} />
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

          {/* The selected clip — not while previewing (just the clips then). */}
          {editing && selected && panel !== "preview" && panel !== "record" && (
            <div>
              <h2 className="mb-2 text-base text-neutral-800">
                {selected.image.caption || (selected.kind === "PHOTO" ? "Photo" : "Video")}
              </h2>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                {/* As it will show in the video: at the video's shape, with its stickers. */}
                {selected.kind === "PHOTO" ? (
                  <div
                    className="relative mx-auto mb-4 h-64 overflow-hidden rounded-md bg-black"
                    style={{ aspectRatio: frameAspect }}
                  >
                    <img src={selected.image.url} alt="" className="h-full w-full object-cover" />
                    {selectedStickers}
                  </div>
                ) : (
                  <div className="mb-4">
                    <TrimScrubber
                      key={selected.id}
                      videoUrl={selected.image.url}
                      aspectRatio={frameAspect}
                      overlay={selectedStickers}
                      trimIn={selected.trimIn ?? 0}
                      trimOut={selected.trimOut ?? selected.sourceDuration ?? 0}
                      sourceDuration={selected.sourceDuration ?? null}
                      onKnownDuration={(d) => handleKnownDuration(selected.id, d)}
                      onTrimChange={(inS, outS) => handleTrimChange(selected.id, inS, outS)}
                      onSplit={(start, end) => handleSplit(selected.id, start, end)}
                      onGrabStill={(atSecond) => grabVideoStill(selected.imageId, atSecond)}
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
        </main>
      </div>
    </div>
  );
}

// The centre panel (2026-10-17): slides down above the clips, with its
// title and a close button.
function CentrePanel({ title, onClose, children }: { title: string; onClose?: () => void; children: React.ReactNode }) {
  return (
    <section className="mb-6 animate-studio-slide-down rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2">
        <h2 className="text-sm font-medium text-neutral-800">{title}</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

// A clip's square thumbnail: a photo, or a video's still picture (its
// first frame if it has none yet).
function ClipThumb({ kind, image }: { kind: "PHOTO" | "VIDEO"; image: ImageInfo }) {
  const className = "aspect-square w-full rounded-md object-cover";
  if (kind === "PHOTO") return <img src={image.url} alt="" className={className} />;
  return image.posterUrl ? (
    <img src={image.posterUrl} alt="" className={className} />
  ) : (
    <VideoThumb src={image.url} className={className} />
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
