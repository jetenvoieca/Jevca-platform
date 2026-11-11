"use client";

import { useEffect, useRef, useState } from "react";

// A dropdown whose list opens in place below it, as wide as the box,
// taking the rest of the panel's height and scrolling within it — so it
// stays inside the panel it's in (the panel's column must be a flex
// column down to it, each with min-h-0)
// (2026-11-11, Craig: the Art manager's filters — a browser's own list
// spills over the page). Tapping outside closes it.
export type PanelSelectOption = { value: string; label: string };

export default function PanelSelect({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string;
  // Shown when nothing is chosen, and first in the list to clear it.
  placeholder: string;
  options: PanelSelectOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const chosen = options.find((o) => o.value === value);
  const choose = (v: string) => {
    setOpen(false);
    if (v !== value) onChange(v);
  };
  const row = "block w-full truncate px-3 py-1 text-left text-[15px] leading-snug";

  return (
    <div ref={ref} className={`flex min-h-0 min-w-0 flex-col ${open ? "flex-1" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full min-w-0 shrink-0 items-center gap-2 border border-neutral-300 bg-white px-3 py-2.5 text-left text-lg font-light text-neutral-600"
      >
        <span className="min-w-0 flex-1 truncate">{chosen ? chosen.label : placeholder}</span>
        <span aria-hidden className="shrink-0 text-sm text-neutral-400">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          className="min-h-0 flex-1 overflow-y-auto border border-t-0 border-neutral-300 bg-white py-1 max-sm:max-h-80"
        >
          <button type="button" onClick={() => choose("")} className={`${row} text-neutral-400 hover:bg-neutral-50`}>
            {placeholder}
          </button>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => choose(o.value)}
              className={`${row} ${o.value === value ? "bg-neutral-100 text-neutral-900" : "text-neutral-700 hover:bg-neutral-50"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
