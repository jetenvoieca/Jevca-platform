"use client";

import { useEffect, useRef, useState } from "react";
import {
  clipFadeIns,
  clipLength,
  clipStarts,
  musicVolumeChanges,
  totalTimelineSeconds,
  volumeAt,
  videoSize,
  type TimelineCaptions,
  type TimelineClip,
  type VideoShape,
} from "@/lib/videoTimeline";
import { stickerPreviewStyle, type StickerRow } from "@/lib/stickers";
import { useVoiceRecorder } from "@/lib/useVoiceRecorder";

// Video Edit's Preview (2026-10-16): plays the video as it stands, in the
// browser, before it's sent to be rendered — on the render's own timing:
// the clips in order at the video's shape (photos for their seconds,
// videos between their trim points), each fading in over the one before
// across the same overlap as the render, with their stickers, and the music
// under it fading in and out — dipping under the voiceover, which plays
// from its start. Close to the render, not exact to the frame. Shown in
// Video Edit's centre panel (2026-10-17), which closes it.
//
// Recording over the preview (2026-10-17): with `recordVoice`, the
// preview plays silently after a 3-second countdown while the microphone
// records; at the end (or Stop) the recording is handed back as the
// voiceover, starting at 0s.

type PreviewClip = TimelineClip & { image: { url: string; kind: "PHOTO" | "VIDEO" } };

const TICK_MS = 50;
const COUNTDOWN_SECONDS = 3;

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
  voice,
  captions,
  stickerLibrary,
  recordVoice,
  onClose,
}: {
  clips: PreviewClip[];
  shape: VideoShape;
  voice: { url: string; start: number; durationSeconds: number; musicUnderVoice: number } | null;
  music: { url: string; volume: number } | null;
  muteClips: boolean;
  captions: TimelineCaptions | null;
  stickerLibrary: StickerRow[];
  // Recording over the preview: what to do with the recording.
  recordVoice?: (wav: Blob, durationSeconds: number) => Promise<void>;
  onClose: () => void;
}) {
  const size = videoSize(shape);
  const total = totalTimelineSeconds(clips);
  const starts = clipStarts(clips);
  const fadeIns = clipFadeIns(clips);
  // Seconds into the video; null before it starts.
  const [time, setTime] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const voiceRef = useRef<HTMLAudioElement>(null);
  const voiceStarted = useRef(false);
  const startedAt = useRef(0);
  const stickers = new Map(stickerLibrary.map((s) => [s.id, s]));
  const musicVolume = music?.volume ?? 0;
  // The music's volume through the video — the same changes as the render.
  const voiceEnd = voice ? Math.min(total, voice.start + voice.durationSeconds) : 0;
  const musicChanges = musicVolumeChanges(
    musicVolume,
    total,
    voice && voice.start < total ? { start: voice.start, end: voiceEnd, level: voice.musicUnderVoice } : null,
  );

  const running = time != null && time < total;

  const play = () => {
    startedAt.current = performance.now();
    setTime(0);
    voiceStarted.current = false;
    if (voiceRef.current) {
      voiceRef.current.pause();
      voiceRef.current.currentTime = 0;
    }
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
      if (audio) {
        if (t >= total) audio.pause();
        else audio.volume = Math.max(0, Math.min(1, volumeAt(musicChanges, t)));
      }
      const voiceAudio = voiceRef.current;
      if (voiceAudio && voice) {
        if (!voiceStarted.current && t >= voice.start && t < voiceEnd) {
          voiceStarted.current = true;
          voiceAudio.currentTime = t - voice.start;
          voiceAudio.play().catch(() => {});
        }
        if (t >= voiceEnd) voiceAudio.pause();
      }
    }, TICK_MS);
    return () => clearInterval(timer);
    // musicChanges and voice follow from these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, total, musicVolume, voice?.start, voice?.musicUnderVoice, voiceEnd]);

  // Recording over the preview.
  const recorder = useVoiceRecorder();
  const [countdown, setCountdown] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const closed = useRef(false);

  const startRecording = async () => {
    setRecordError(null);
    try {
      await recorder.openMicrophone();
    } catch {
      setRecordError("The microphone couldn't be used — allow it in the browser and try again.");
      return;
    }
    for (let n = COUNTDOWN_SECONDS; n > 0; n--) {
      setCountdown(n);
      await new Promise((r) => setTimeout(r, 1000));
      if (closed.current) return;
    }
    setCountdown(null);
    recorder.start();
    play();
  };

  // At the end of the video (or Stop), the recording becomes the voiceover.
  const recordingDone = recorder.recording && time != null && time >= total;
  useEffect(() => {
    if (!recordingDone || !recordVoice) return;
    setSaving(true);
    recorder
      .stop()
      .then(async (result) => {
        if (result) await recordVoice(result.wav, result.durationSeconds);
        onClose();
      })
      .catch((err) => setRecordError(err instanceof Error ? err.message : "The recording couldn't be saved."))
      .finally(() => setSaving(false));
    // Once, when the recording reaches the end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingDone]);

  // Closing stops everything (a recording not yet finished is dropped).
  useEffect(() => {
    closed.current = false;
    return () => {
      closed.current = true;
      audioRef.current?.pause();
      voiceRef.current?.pause();
      recorder.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The clips on screen now — two while one fades in over the other.
  const showing = running
    ? clips
        .map((clip, i) => ({ clip, i }))
        .filter(({ clip, i }) => time >= starts[i] && time < starts[i] + clipLength(clip))
    : [];
  const current = showing.length > 0 ? showing[showing.length - 1].i : null;
  // Typed captions on screen now (those from the voiceover are written at
  // render time, so aren't shown here).
  const captionNow =
    running && captions?.mode === "typed"
      ? captions.lines.find((l) => l.text.trim() && time >= l.start && time < l.end)
      : undefined;

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-neutral-900 p-4">
      <div
        className="relative h-[45vh] max-w-full overflow-hidden rounded-lg bg-black"
        style={{ aspectRatio: `${size.width} / ${size.height}` }}
      >
        {showing.map(({ clip, i }) => (
          <FadeIn key={`${clip.id}-${i}`} seconds={fadeIns[i]}>
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
        {captionNow && captions && (
          <div
            className={`pointer-events-none absolute inset-x-[5%] text-center font-bold leading-tight text-white ${
              captions.position === "top"
                ? "top-[8%]"
                : captions.position === "bottom"
                  ? "bottom-[8%]"
                  : "top-1/2 -translate-y-1/2"
            } ${captions.style === "pop" ? "uppercase" : ""}`}
            style={{
              fontSize: "min(4.5vh, 5vw)",
              WebkitTextStroke: "1px #000",
              textShadow: "0 2px 4px rgba(0,0,0,0.8)",
            }}
          >
            {captionNow.text}
          </div>
        )}
        {countdown != null ? (
          <div className="absolute inset-0 flex items-center justify-center text-7xl font-bold text-white">
            {countdown}
          </div>
        ) : saving ? (
          <div className="absolute inset-0 flex items-center justify-center text-lg text-white">
            Saving the voiceover…
          </div>
        ) : (
          !running && (
            <button
              type="button"
              onClick={recordVoice ? startRecording : play}
              className="absolute inset-0 flex items-center justify-center text-white"
            >
              <span className="rounded-full bg-white/20 px-6 py-3 text-lg backdrop-blur hover:bg-white/30">
                {recordVoice ? "Start recording" : time == null ? "▶ Play preview" : "↻ Play again"}
              </span>
            </button>
          )
        )}
        {recorder.recording && running && (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> Recording
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm text-white">
        <span>
          {current != null ? `Clip ${current + 1} of ${clips.length} · ` : ""}
          {Math.min(time ?? 0, total).toFixed(0)}s / {total.toFixed(0)}s
        </span>
        {recorder.recording && running && (
          <button
            type="button"
            onClick={() => setTime(total)}
            className="rounded-md bg-red-600 px-3 py-1 font-medium hover:bg-red-500"
          >
            Stop
          </button>
        )}
      </div>
      {recordError && <p className="text-sm text-red-300">{recordError}</p>}
      <p className="text-xs text-white/60">
        {recordVoice
          ? "The video plays silently while you speak; recording stops at the end, or press Stop (closing the panel drops it). It replaces any voiceover and starts at 0s."
          : "A preview on the render's timing — the render itself is exact to the frame."}
      </p>
      {music && <audio ref={audioRef} src={music.url} preload="auto" />}
      {voice && <audio ref={voiceRef} src={voice.url} preload="auto" />}
    </div>
  );
}
