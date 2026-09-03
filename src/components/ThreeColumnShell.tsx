"use client";

import { useState } from "react";

export default function ThreeColumnShell({
  preview,
  edit,
  menu,
}: {
  preview: React.ReactNode;
  edit: React.ReactNode;
  menu: React.ReactNode;
}) {
  // Expanding gives the preview the full width and hides the edit/menu
  // columns entirely, rather than opening a separate modal — same
  // corner-button convention already used for the canvas in
  // PavilionEditor.tsx (⤢ to expand, ⤡ to collapse back).
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`grid gap-0 ${
        expanded ? "grid-cols-1" : "grid-cols-[1fr_1.3fr_260px]"
      }`}
    >
      <div className="relative border-r border-neutral-200 bg-neutral-50 p-6">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse preview" : "Expand preview"}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-500 hover:bg-neutral-50"
        >
          {expanded ? "⤡" : "⤢"}
        </button>
        {preview}
      </div>
      {!expanded && (
        <>
          <div className="p-6">{edit}</div>
          <div className="border-l border-neutral-200 p-4">{menu}</div>
        </>
      )}
    </div>
  );
}
