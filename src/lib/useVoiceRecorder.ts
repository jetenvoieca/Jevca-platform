"use client";

import { useEffect, useRef, useState } from "react";
import { recordingToWav } from "@/lib/audioWav";

// Recording a voice from the microphone (2026-10-17 — Video Edit's
// voiceover, on its own or over the preview). openMicrophone asks for the
// microphone (it throws if refused); start begins recording at once, so
// it can line up with the preview; stop ends it and gives the WAV.

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const release = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // Stops the microphone if the page is left mid-recording.
  useEffect(() => () => release(), []);

  const openMicrophone = async () => {
    if (!streamRef.current) streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
  };

  const start = () => {
    if (!streamRef.current) return;
    const recorder = new MediaRecorder(streamRef.current);
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  };

  // The recording as a WAV; null if nothing was recorded.
  const stop = (): Promise<{ wav: Blob; durationSeconds: number } | null> => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    if (!recorder || recorder.state === "inactive") {
      release();
      return Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      recorder.onstop = () => {
        release();
        if (chunks.length === 0) return resolve(null);
        recordingToWav(new Blob(chunks, { type: recorder.mimeType })).then(resolve, reject);
      };
      recorder.stop();
    });
  };

  // Stops without keeping anything.
  const cancel = () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    if (recorder && recorder.state !== "inactive") recorder.stop();
    release();
  };

  return { recording, openMicrophone, start, stop, cancel };
}
