"use client";

import { randomId } from "@/lib/randomId";
import {
  CAPTION_POSITIONS,
  CAPTION_STYLES,
  type CaptionLine,
  type CaptionMode,
  type TimelineCaptions,
} from "@/lib/videoTimeline";

// Video Edit's captions (2026-10-17): words on screen, either written at
// render time from what the voiceover says, or typed lines with their own
// times. One look and one position for the whole video.

const LINE_SECONDS = 3;

export default function CaptionsControl({
  captions,
  hasVoice,
  totalSeconds,
  onChange,
}: {
  captions: TimelineCaptions | null;
  hasVoice: boolean;
  totalSeconds: number;
  // `save: "now"` for choices; typing saves shortly after.
  onChange: (captions: TimelineCaptions | null, save: "now" | "soon") => void;
}) {
  const changeMode = (mode: CaptionMode | "") => {
    if (!mode) return onChange(null, "now");
    onChange(
      { mode, style: captions?.style ?? "highlight", position: captions?.position ?? "bottom", lines: captions?.lines ?? [] },
      "now"
    );
  };

  const changeLine = (id: string, change: Partial<CaptionLine>) =>
    captions &&
    onChange({ ...captions, lines: captions.lines.map((l) => (l.id === id ? { ...l, ...change } : l)) }, "soon");

  const addLine = () => {
    if (!captions) return;
    const start = captions.lines.reduce((latest, l) => Math.max(latest, l.end), 0);
    onChange(
      { ...captions, lines: [...captions.lines, { id: randomId(), text: "", start, end: start + LINE_SECONDS }] },
      "now"
    );
  };

  const removeLine = (id: string) =>
    captions && onChange({ ...captions, lines: captions.lines.filter((l) => l.id !== id) }, "now");

  const select = "rounded-md border border-neutral-300 px-2 py-1 text-sm";
  const seconds = "w-16 rounded-md border border-neutral-300 px-2 py-0.5 text-sm";

  return (
    <div className="mt-2 text-sm text-neutral-600">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          Captions
          <select value={captions?.mode ?? ""} onChange={(e) => changeMode(e.target.value as CaptionMode | "")} className={select}>
            <option value="">None</option>
            <option value="voice" disabled={!hasVoice}>
              From the voiceover
            </option>
            <option value="typed">Typed lines</option>
          </select>
        </label>
        {captions && (
          <>
            <label className="flex items-center gap-2">
              Look
              <select
                value={captions.style}
                onChange={(e) => onChange({ ...captions, style: e.target.value as TimelineCaptions["style"] }, "now")}
                className={select}
              >
                {CAPTION_STYLES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Position
              <select
                value={captions.position}
                onChange={(e) =>
                  onChange({ ...captions, position: e.target.value as TimelineCaptions["position"] }, "now")
                }
                className={select}
              >
                {CAPTION_POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {captions?.mode === "voice" && (
          <span className="text-xs text-neutral-400">
            {hasVoice
              ? "Written from the voiceover when the video is made — not shown in the preview."
              : "Add a voiceover first, or choose Typed lines."}
          </span>
        )}
      </div>

      {captions?.mode === "typed" && (
        <div className="mt-2 space-y-1">
          {captions.lines.map((line) => (
            <div key={line.id} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={line.text}
                maxLength={200}
                placeholder="What it says"
                onChange={(e) => changeLine(line.id, { text: e.target.value })}
                className="min-w-48 flex-1 rounded-md border border-neutral-300 px-2 py-0.5 text-sm"
              />
              <label className="flex items-center gap-1">
                from
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={line.start}
                  onChange={(e) => changeLine(line.id, { start: Math.max(0, Number(e.target.value) || 0) })}
                  className={seconds}
                />
              </label>
              <label className="flex items-center gap-1">
                to
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={line.end}
                  onChange={(e) => changeLine(line.id, { end: Math.max(0, Number(e.target.value) || 0) })}
                  className={seconds}
                />
                s
              </label>
              <button
                type="button"
                onClick={() => removeLine(line.id)}
                className="text-xs text-neutral-400 hover:text-red-600"
              >
                Remove
              </button>
              {line.end <= line.start && <span className="text-xs text-amber-600">Ends before it starts.</span>}
              {line.start >= totalSeconds && totalSeconds > 0 && (
                <span className="text-xs text-amber-600">After the end of the video.</span>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addLine}
            className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
          >
            + Add a line
          </button>
        </div>
      )}
    </div>
  );
}
