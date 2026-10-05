import type { ReactNode } from "react";
import { groupBlocksByRow } from "@/lib/blocks";
import {
  blockTypeLabel,
  type GridSpacing,
  type LayoutBlock,
  type PageStyleLayout,
} from "@/lib/pageStyleLayout";

// Draws a Page Style's layout as grey placeholders (2026-10-04) — what
// goes where on the page, with no content. Used by the Page Styles
// page's Preview panel. Grids of images use the style's grid spacing.
export default function PageStylePreview({ style }: { style: PageStyleLayout }) {
  if (style.type === "SECTION") {
    const { backgroundColor, video, gridSpacing } = style.layout;
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
          <PlaceholderGrid count={8} spacing={gridSpacing} />
        </Labelled>
        <Labelled label="Description — from the page's curation">
          <BlockShape block={{ id: "description", type: "text" }} spacing={gridSpacing} />
        </Labelled>
        {video && (
          <Labelled label="Video">
            <BlockShape block={{ id: "video", type: "video" }} spacing={gridSpacing} />
          </Labelled>
        )}
      </div>
    );
  }

  const { backgroundColor, backgroundImage, gridSpacing, blocks } = style.layout;
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
              <Labelled label={blockLabel(b)}>
                <BlockShape block={b} spacing={gridSpacing} />
              </Labelled>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function blockLabel(block: LayoutBlock): string {
  const label = blockTypeLabel(block.type);
  const d = block.doors;
  if (!d) return label;
  return d.perSlide === 1
    ? `${label} — one at a time from the page's curation, ${d.duration}s, slide ${d.speed}s`
    : `${label} — pairs from the page's curation, ${d.duration}s, slide ${d.speed}s, gap ${d.gap}px`;
}

// Grey squares, four across, spaced as the style's grid spacing.
function PlaceholderGrid({ count, spacing }: { count: number; spacing: GridSpacing }) {
  return (
    <div
      className="grid grid-cols-4"
      style={{ rowGap: spacing.vertical, columnGap: spacing.horizontal }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="aspect-square rounded bg-neutral-200" />
      ))}
    </div>
  );
}

// A rough outline of each block type, so the layout reads at a glance.
function BlockShape({ block, spacing }: { block: LayoutBlock; spacing: GridSpacing }) {
  switch (block.type) {
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
      return <PlaceholderGrid count={8} spacing={spacing} />;
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
    case "slidingdoors": {
      const single = block.doors?.perSlide === 1;
      return (
        <div className="relative flex h-48" style={{ gap: single ? 0 : (block.doors?.gap ?? 0) }}>
          <div className="flex-1 rounded bg-neutral-200" />
          {!single && <div className="flex-1 rounded bg-neutral-200" />}
          <span className="absolute inset-0 flex items-center justify-between px-3 text-2xl text-neutral-400">
            <span>◀</span>
            {!single && <span>▶</span>}
          </span>
        </div>
      );
    }
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
