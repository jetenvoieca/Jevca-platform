"use client";

import { useState, type ReactNode } from "react";
import { groupByTheme, styleTheme } from "@/lib/styleThemes";

// The Page Styles and Menus lists, grouped under their themes (2026-11-02,
// Craig's mockup — see lib/styleThemes.ts). Each theme is a bar that
// opens and closes its styles; the theme of the selected style starts
// open. Clicking a style selects it, clicking it again unselects it.
export function ThemedStyleList<T extends { id: string; name: string }>({
  items,
  selectedId,
  onSelect,
  tag,
}: {
  items: T[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  // Shown faintly on the right of each style (its type).
  tag: (item: T) => ReactNode;
}) {
  const selected = items.find((i) => i.id === selectedId);
  const selectedTheme = selected ? styleTheme(selected.name) : null;
  const [open, setOpen] = useState<Set<string>>(() => new Set(selectedTheme ? [selectedTheme] : []));
  // A style selected from elsewhere (a duplicate, a new style) opens its
  // theme, so it can be seen.
  const [shownTheme, setShownTheme] = useState(selectedTheme);
  if (selectedTheme !== shownTheme) {
    setShownTheme(selectedTheme);
    if (selectedTheme && !open.has(selectedTheme)) setOpen(new Set(open).add(selectedTheme));
  }

  const toggle = (theme: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(theme)) next.delete(theme);
      else next.add(theme);
      return next;
    });

  return (
    <>
      {groupByTheme(items).map(({ theme, items: themed }) => (
        <div key={theme} className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => toggle(theme)}
            aria-expanded={open.has(theme)}
            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-center text-sm text-neutral-900 hover:bg-neutral-50"
          >
            {theme}
          </button>
          {open.has(theme) &&
            themed.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id === selectedId ? null : s.id)}
                className={`flex w-full items-baseline justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm ${
                  s.id === selectedId
                    ? "border-neutral-900 bg-neutral-100 text-neutral-900"
                    : "border-transparent text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 text-xs text-neutral-400">{tag(s)}</span>
              </button>
            ))}
        </div>
      ))}
    </>
  );
}

// A style dropdown's choices, in groups under their themes.
export function ThemedStyleOptions({ items }: { items: { id: string; name: string }[] }) {
  return (
    <>
      {groupByTheme(items).map(({ theme, items: themed }) => (
        <optgroup key={theme} label={theme}>
          {themed.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
