"use client";

import { useEffect, useState } from "react";

// A number setting (moved out of PageStyleEditor 2026-10-06 so the Menus
// editor shares it), applied when the box is left (or Enter). Kept within its
// limits when saved; anything that isn't a number goes back to the
// current value. `wide` gives room for a longer label; `compact` is the
// small version used inside the Layout list.
export default function NumberField({
  label,
  unit,
  step,
  value,
  limits,
  onCommit,
  wide = false,
  compact = false,
}: {
  label: string;
  unit: string;
  step: number;
  value: number;
  limits: { min: number; max: number };
  onCommit: (value: number) => void;
  wide?: boolean;
  compact?: boolean;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const commit = () => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n)) {
      setText(String(value));
      return;
    }
    if (n !== value) onCommit(n);
  };

  const labelClass = compact ? "shrink-0" : `${wide ? "flex-1" : "w-24"} shrink-0`;

  return (
    <label
      className={`flex items-center gap-2 ${
        compact ? "text-xs text-neutral-500" : "text-sm text-neutral-700"
      }`}
    >
      <span className={labelClass}>{label}</span>
      <input
        type="number"
        min={limits.min}
        max={limits.max}
        step={step}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={`rounded-md border border-neutral-300 px-2 ${
          compact ? "w-14 py-0.5 text-xs" : "w-16 py-1 text-sm"
        }`}
      />
      <span className="text-xs text-neutral-400">{unit}</span>
    </label>
  );
}
