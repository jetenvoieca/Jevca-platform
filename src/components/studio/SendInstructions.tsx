"use client";

import { useState } from "react";
import { sendInstructions } from "@/lib/studioApi";
import { NoticeLine, panelCls } from "@/components/studio/StudioUi";
import type { Notice } from "@/components/studio/StudioUi";

// "Instructions" (2026-10-31, Craig's mockup): a plain text box and SEND.
// The text goes to the artist's Hopper as a note (see HopperNote), where
// it's read and marked done. A fuller form will follow.

const MAX_LENGTH = 5000;

export default function SendInstructions({
  token,
  onDone,
  onBusyChange,
}: {
  token: string;
  // Called once it's sent — the app returns to its first screen showing
  // this message.
  onDone: (notice: Notice) => void;
  // Lets the app stop the artist leaving while it's being sent.
  onBusyChange: (busy: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const send = async () => {
    if (!text.trim()) {
      setNotice({ text: "Type your instructions first.", tone: "info" });
      return;
    }
    setSending(true);
    onBusyChange(true);
    setNotice({ text: "Sending…", tone: "info" });
    try {
      await sendInstructions(token, text.trim());
      onDone({ text: "Sent", tone: "info" });
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : "Couldn't send. Please try again.",
        tone: "error",
      });
    } finally {
      setSending(false);
      onBusyChange(false);
    }
  };

  return (
    <section className={`${panelCls} flex flex-1 flex-col gap-4 p-4`}>
      {/* 16px+ text so iPhone doesn't zoom when the box is tapped. */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_LENGTH}
        disabled={sending}
        placeholder="Text"
        aria-label="Instructions"
        className="min-h-[50dvh] w-full flex-1 resize-none rounded-md bg-white p-4 text-lg text-[#555] placeholder:text-center placeholder:text-[#8a8a8a] focus:outline-none"
      />
      <NoticeLine notice={notice} />
      <div>
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="h-14 w-44 rounded-sm bg-[#5a5a5a] text-xl text-white active:bg-[#444] disabled:opacity-50"
        >
          SEND
        </button>
      </div>
    </section>
  );
}
