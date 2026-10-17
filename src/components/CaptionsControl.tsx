"use client";

import { randomId } from "@/lib/randomId";
import {
  CAPTION_POSITIONS,
  CAPTION_STYLES,
  type CaptionLine,
  type CaptionMode,
  type TimelineCaptions,
} from "@/lib/videoTimeline";
import { PANEL_BUTTON, PANEL_ROWS, PANEL_SELECT } from "@/components/videoEditorUi";

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
      {
        mode,
        style: captions?.style ?? "highlight",
        position: captions?.position ?? "bottom",
        lines: captions?.lines ?? [],
      },
      "now",
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
      "now",
    );
  };

  const removeLine = (id: string) =>
    captions && onChange({ ...captions, lines: captions.lines.filter((l) => l.id !== id) }, "now");

  const seconds = "w-16 rounded-md border border-neutral-300 px-2 py-0.5 text-sm";

  return (
    <div className="flex flex-wrap gap-6 text-sm text-neutral-600">
      {/* Where the words come from, how they look, where they sit. */}
      <div className="w-72">
        <div className={PANEL_ROWS}>
          <span>Source</span>
          <select
            value={captions?.mode ?? ""}
            onChange={(e) => changeMode(e.target.value as CaptionMode | "")}
            className={PANEL_SELECT}
          >
            <option value="">None</option>
            <option value="voice" disabled={!hasVoice}>
              From the voiceover
            </option>
            <option value="typed">Typed lines</option>
          </select>
          {captions && (
            <>
              <span>Look</span>
              <select
                value={captions.style}
                onChange={(e) => onChange({ ...captions, style: e.target.value as TimelineCaptions["style"] }, "now")}
                className={PANEL_SELECT}
              >
                {CAPTION_STYLES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span>Position</span>
              <select
                value={captions.position}
                onChange={(e) =>
                  onChange({ ...captions, position: e.target.value as TimelineCaptions["position"] }, "now")
                }
                className={PANEL_SELECT}
              >
                {CAPTION_POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <span />
              <button type="button" onClick={() => onChange(null, "now")} className={PANEL_BUTTON}>
                Remove
              </button>
            </>
          )}
        </div>
      </div>

      {/* The words: typed lines with their times, or a note. */}
      <div className="min-w-0 flex-1">
        {!captions && (
          <p className="py-1.5 text-neutral-400">
            No captions — choose a Source: words written from the voiceover, or lines you type.
          </p>
        )}
        {captions?.mode === "voice" && (
          <p className="py-1.5 text-neutral-400">
            {hasVoice
              ? "Written from the voiceover when the video is made — not shown in the preview."
              : "Add a voiceover first, or choose Typed lines."}
          </p>
        )}
        {captions?.mode === "typed" && (
          <div className="space-y-2">
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
    </div>
  );
}
