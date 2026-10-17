"use client";

import { useEffect, useRef, useState } from "react";
import { putToR2 } from "@/lib/putToR2";
import { requestVoiceUpload } from "@/lib/actions/videoEditor";
import { audioFileDuration, recordingToWav } from "@/lib/audioWav";
import { MUSIC_ACCEPT } from "@/lib/musicTracks";
import type { TimelineVoice } from "@/lib/videoTimeline";

// Video Edit's voiceover (2026-10-17): record one in the browser (iPad or
// computer microphone) or upload a voice memo; then when it starts in the
// video and how far the music drops while it plays. One per video.

const DEFAULT_MUSIC_UNDER_VOICE = 0.3;

export default function VoiceoverControl({
  artistId,
  voice,
  totalSeconds,
  hasMusic,
  onChange,
}: {
  artistId: string;
  voice: TimelineVoice | null;
  totalSeconds: number;
  hasMusic: boolean;
  // `save: "now"` for a new recording; changes to start/level save shortly after.
  onChange: (voice: TimelineVoice | null, save: "now" | "soon") => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!recording) return;
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 200);
    return () => clearInterval(timer);
  }, [recording]);

  // Stops the microphone if the page is left mid-recording.
  useEffect(() => () => recorderRef.current?.stream.getTracks().forEach((t) => t.stop()), []);

  const save = async (file: Blob, contentType: string, durationSeconds: number) => {
    const step = await requestVoiceUpload(artistId, contentType);
    if ("error" in step) throw new Error(step.error);
    await putToR2(step.uploadUrl, file, contentType);
    onChange(
      {
        key: step.key,
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setBusy(true);
        try {
          const { wav, durationSeconds } = await recordingToWav(new Blob(chunks, { type: recorder.mimeType }));
          await save(wav, "audio/wav", durationSeconds);
        } catch (err) {
          setError(err instanceof Error ? err.message : "The recording couldn't be saved.");
        } finally {
          setBusy(false);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setElapsed(0);
      setRecording(true);
    } catch {
      setError("The microphone couldn't be used — allow it in the browser and try again.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
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
