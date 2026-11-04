"use client";

import { useState } from "react";
import { getMediaShareFile } from "@/lib/actions/mediaCatalogue";

// Share in the Media Catalogue (2026-11-04, Craig: send a video by
// WhatsApp): the file itself, so it plays in the message. On a phone or
// iPad, Share fetches the file, then "Send" opens the device's share sheet
// (WhatsApp, Messages, Mail…) — two taps, as the sheet must open straight
// from a tap and a video takes a moment to fetch. Where the device can't
// share files (most computers), or the file can't be fetched, it's
// downloaded instead.

type State =
  | { step: "idle" }
  | { step: "preparing" }
  | { step: "ready"; file: File }
  | { step: "error"; message: string };

const buttonCls = "rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50";

export default function ShareMediaButton({ mediaId }: { mediaId: string }) {
  const [state, setState] = useState<State>({ step: "idle" });

  const download = (url: string) => {
    window.location.href = url;
    setState({ step: "idle" });
  };

  const prepare = async () => {
    setState({ step: "preparing" });
    const found = await getMediaShareFile(mediaId).catch(() => ({ error: "Couldn't get the file — try again." }));
    if ("error" in found) return setState({ step: "error", message: found.error });
    const probe = new File([], found.filename, { type: found.mimeType });
    if (!navigator.canShare?.({ files: [probe] })) return download(found.url);
    try {
      const response = await fetch(found.url);
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      setState({ step: "ready", file: new File([blob], found.filename, { type: found.mimeType }) });
    } catch {
      download(found.url);
    }
  };

  const send = async (file: File) => {
    try {
      await navigator.share({ files: [file], title: file.name });
      setState({ step: "idle" });
    } catch (e) {
      // Closing the share sheet isn't an error.
      if (e instanceof DOMException && e.name === "AbortError") return setState({ step: "idle" });
      setState({ step: "error", message: "Couldn't open sharing — try again." });
    }
  };

  return (
    <>
      {state.step === "ready" ? (
        <button type="button" onClick={() => send(state.file)} className={`${buttonCls} bg-neutral-900 text-white hover:bg-neutral-700`}>
          Send
        </button>
      ) : (
        <button type="button" onClick={prepare} disabled={state.step === "preparing"} className={buttonCls}>
          {state.step === "preparing" ? "Preparing…" : "Share"}
        </button>
      )}
      {state.step === "error" && <p className="w-full text-xs text-red-600">{state.message}</p>}
    </>
  );
}
