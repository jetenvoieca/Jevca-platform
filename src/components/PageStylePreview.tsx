import type { ReactNode } from "react";
import { groupBlocksByRow } from "@/lib/blocks";
import { blockTypeLabel, type LayoutBlock, type PageStyleLayout } from "@/lib/pageStyleLayout";

// Draws a Page Style's layout as grey placeholders (2026-10-04) — what
// goes where on the page, with no content. Used by the Page Styles
// page's Preview panel.
export default function PageStylePreview({ style }: { style: PageStyleLayout }) {
  if (style.type === "SECTION") {
    const { backgroundColor, video } = style.layout;
    return (
      <div
        className="flex min-h-full flex-col gap-4 rounded-md p-4"
        style={{ backgroundColor: backgroundColor ?? undefined }}
      >
        <Bar className="mx-auto h-6 w-1/3" />
        <Labelled label="Byline">
          <Bar className="mx-auto h-3 w-1/2" />
        </Labelled>
        <Labelled label="Artwork grid — from the page's curation">
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="aspect-square rounded bg-neutral-200" />
            ))}
          </div>
        </Labelled>
        <Labelled label="Description — from the page's curation">
          <BlockShape type="text" />
        </Labelled>
        {video && (
          <Labelled label="Video">
            <BlockShape type="video" />
          </Labelled>
        )}
      </div>
    );
  }

  const { backgroundColor, backgroundImage, blocks } = style.layout;
  const rows = groupBlocksByRow(blocks);

  return (
    <div
      className={`relative flex min-h-full flex-col gap-4 rounded-md p-4 ${
        backgroundImage ? "border-2 border-dashed border-neutral-300" : ""
      }`}
      style={{ backgroundColor: backgroundColor ?? undefined }}
    >
      {backgroundImage && (
        <span className="absolute right-2 top-2 rounded bg-white/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
          Background image
        </span>
      )}
      {rows.length === 0 && (
        <p className="py-10 text-center text-sm text-neutral-400">
          No blocks yet. Use Edit to add some.
        </p>
      )}
      {rows.map((row) => (
        <div key={row[0].id} className="flex gap-4">
          {row.map((b) => (
            <div key={b.id} className="min-w-0 flex-1">
              <Labelled label={blockTypeLabel(b.type)}>
                <BlockShape type={b.type} />
              </Labelled>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// A rough outline of each block type, so the layout reads at a glance.
function BlockShape({ type }: { type: LayoutBlock["type"] }) {
  switch (type) {
    case "header":
      return <Bar className="h-7 w-2/3" />;
    case "text":
      return (
        <div className="flex flex-col gap-2">
          <Bar className="h-2.5 w-full" />
          <Bar className="h-2.5 w-11/12" />
          <Bar className="h-2.5 w-4/5" />
        </div>
      );
    case "image":
      return <div className="h-40 rounded bg-neutral-200" />;
    case "gallery":
      return (
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="aspect-square rounded bg-neutral-200" />
          ))}
        </div>
      );
    case "artwork":
      return (
        <div className="flex gap-3">
          <div className="aspect-square w-1/3 rounded bg-neutral-200" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <Bar className="h-3 w-3/4" />
            <Bar className="h-2.5 w-1/2" />
          </div>
        </div>
      );
    case "video":
      return (
        <div className="flex h-40 items-center justify-center rounded bg-neutral-200 text-2xl text-neutral-400">
          ▶
        </div>
      );
    case "textgrid":
      return (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 9 }, (_, i) => (
            <Bar key={i} className="h-2.5 w-full" />
          ))}
        </div>
      );
  }
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-neutral-300 bg-white/70 p-3">
      <p className="mb-2 text-[10px] uppercase tracking-wide text-neutral-400">{label}</p>
      {children}
    </div>
  );
}

function Bar({ className }: { className: string }) {
  return <div className={`rounded bg-neutral-200 ${className}`} />;
}
