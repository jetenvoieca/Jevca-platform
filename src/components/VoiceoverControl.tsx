"use client";

import { useEffect, useRef, useState } from "react";
import { audioFileDuration } from "@/lib/audioWav";
import { useVoiceRecorder } from "@/lib/useVoiceRecorder";
import { uploadVoice } from "@/lib/voiceUpload";
import { MUSIC_ACCEPT } from "@/lib/musicTracks";
import { DEFAULT_MUSIC_UNDER_VOICE, type TimelineVoice } from "@/lib/videoTimeline";

// Video Edit's voiceover (2026-10-17): record one in the browser (iPad or
// computer microphone) — on its own, or over the preview playing silently
// (in VideoPreviewPlayer) — or upload a voice memo; then when it starts in
// the video and how far the music drops while it plays. One per video.

export default function VoiceoverControl({
  artistId,
  voice,
  totalSeconds,
  hasMusic,
  canRecordOverPreview,
  onRecordOverPreview,
  onChange,
}: {
  artistId: string;
  voice: TimelineVoice | null;
  totalSeconds: number;
  hasMusic: boolean;
  canRecordOverPreview: boolean;
  onRecordOverPreview: () => void;
  // `save: "now"` for a new recording; changes to start/level save shortly after.
  onChange: (voice: TimelineVoice | null, save: "now" | "soon") => void;
}) {
  const recorder = useVoiceRecorder();
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recording = recorder.recording;

  useEffect(() => {
    if (!recording) return;
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 200);
    return () => clearInterval(timer);
  }, [recording]);

  const save = async (file: Blob, contentType: string, durationSeconds: number) => {
    const key = await uploadVoice(artistId, file, contentType);
    onChange(
      {
        key,
        durationSeconds,
        start: voice?.start ?? 0,
        musicUnderVoice: voice?.musicUnderVoice ?? DEFAULT_MUSIC_UNDER_VOICE,
      },
      "now"
    );
  };

  const startRecording = async () => {
    setError(null);
    try {
      await recorder.openMicrophone();
    } catch {
      setError("The microphone couldn't be used — allow it in the browser and try again.");
      return;
    }
    setElapsed(0);
    recorder.start();
  };

  const stopRecording = async () => {
    setBusy(true);
    try {
      const result = await recorder.stop();
      if (result) await save(result.wav, "audio/wav", result.durationSeconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The recording couldn't be saved.");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const durationSeconds = await audioFileDuration(file);
      if (durationSeconds == null) throw new Error("That file's length couldn't be read — try an MP3, M4A or WAV.");
      await save(file, file.type, durationSeconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file couldn't be uploaded.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const runsPastEnd = voice && voice.start + voice.durationSeconds > totalSeconds + 0.05;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-neutral-600">
      <span>Voiceover</span>
      {recording ? (
        <>
          <span className="flex items-center gap-1 text-red-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> Recording {elapsed.toFixed(0)}s
          </span>
          <button
            type="button"
            onClick={stopRecording}
            className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700"
          >
            Stop
          </button>
        </>
      ) : busy ? (
        <span className="text-xs text-neutral-400">Saving…</span>
      ) : (
        <>
          <button
            type="button"
            onClick={startRecording}
            className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
          >
            ● {voice ? "Record again" : "Record"}
          </button>
          {canRecordOverPreview && (
            <button
              type="button"
              onClick={onRecordOverPreview}
              className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
            >
              ● Record over the preview
            </button>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
          >
            {voice ? "Replace with a file" : "Upload a file"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={MUSIC_ACCEPT}
            className="hidden"
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </>
      )}

      {voice && !recording && !busy && (
        <>
          <audio src={`/api/media/${voice.key}`} controls preload="none" className="h-8" />
          <span className="text-xs text-neutral-400">{voice.durationSeconds.toFixed(0)}s</span>
          <label className="flex items-center gap-1">
            starts at
            <input
              type="number"
              min={0}
              step={0.5}
              value={voice.start}
              onChange={(e) => onChange({ ...voice, start: Math.max(0, Number(e.target.value) || 0) }, "soon")}
              className="w-16 rounded-md border border-neutral-300 px-2 py-0.5 text-sm"
            />
            s
          </label>
          {hasMusic && (
            <label className="flex items-center gap-2">
              Music under voice
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={voice.musicUnderVoice}
                onChange={(e) => onChange({ ...voice, musicUnderVoice: Number(e.target.value) }, "soon")}
              />
              <span className="w-9 text-xs text-neutral-400">{Math.round(voice.musicUnderVoice * 100)}%</span>
            </label>
          )}
          <button
            type="button"
            onClick={() => onChange(null, "now")}
            className="text-xs text-neutral-400 hover:text-red-600"
          >
            Remove
          </button>
          {runsPastEnd && (
            <span className="text-xs text-amber-600">Runs past the end of the video — the rest is cut.</span>
          )}
        </>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
