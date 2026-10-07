import type { ReactNode } from "react";
import { groupBlocksByRow } from "@/lib/blocks";
import {
  blockTypeLabel,
  blockWidthOf,
  rowKey,
  rowSettingsOf,
  type CanvasLayout,
  type GridSpacing,
  type HorizontalAlign,
  type LayoutBlock,
  type PageStyleLayout,
} from "@/lib/pageStyleLayout";
import { PAGE_MARGIN_CLASS, pageMarginStyle } from "@/components/pageMargins";
import { ROW_BLOCK_CLASS, rowBlockStyle, rowClass } from "@/components/pageRows";

// Draws a Page Style's layout as grey placeholders (2026-10-04) — what
// goes where on the page, with no content. Used by the Page Styles
// page's Preview panel. Uses the style's grid spacing, block spacing,
// block widths, page margin (2026-10-06) and row alignment (2026-10-07),
// drawn the same way as the site's pages (see components/pageRows.ts).
export default function PageStylePreview({ style }: { style: PageStyleLayout }) {
  if (style.type === "CANVAS") return <CanvasPreview layout={style.layout} />;

  if (style.type === "SECTION") {
    const { backgroundColor, video, gridSpacing, margins, spacing, widths, aligns } =
      style.layout;
    return (
      <div
        className={`flex min-h-full flex-col rounded-md ${PAGE_MARGIN_CLASS}`}
        style={{ ...pageMarginStyle(margins), backgroundColor: backgroundColor ?? undefined }}
      >
        <Bar className="mb-4 h-6 w-1/3 self-center" />
        <Part width={widths.byline} align={aligns.byline}>
          <Labelled label="Byline">
            <Bar className="mx-auto h-3 w-1/2" />
          </Labelled>
        </Part>
        <Part width={widths.grid} align={aligns.grid} above={spacing.belowByline}>
          <Labelled label="Artwork grid — from the page's curation">
            <PlaceholderGrid count={8} spacing={gridSpacing} />
          </Labelled>
        </Part>
        <Part width={widths.description} align={aligns.description} above={spacing.belowGrid}>
          <Labelled label="Description — from the page's curation">
            <BlockShape block={{ id: "description", type: "text" }} spacing={gridSpacing} />
          </Labelled>
        </Part>
        {video && (
          <Part width={widths.video} align={aligns.video} above={spacing.belowDescription}>
            <Labelled label="Video">
              <BlockShape block={{ id: "video", type: "video" }} spacing={gridSpacing} />
            </Labelled>
          </Part>
        )}
      </div>
    );
  }

  const layout = style.layout;
  const rows = groupBlocksByRow(layout.blocks);

  return (
    <div
      className={`relative flex min-h-full flex-col rounded-md ${PAGE_MARGIN_CLASS} ${
        layout.backgroundImage ? "border-2 border-dashed border-neutral-300" : ""
      }`}
      style={{
        ...pageMarginStyle(layout.margins),
        backgroundColor: layout.backgroundColor ?? undefined,
      }}
    >
      {layout.backgroundImage && (
        <span className="absolute right-2 top-2 rounded bg-white/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
          Background image
        </span>
      )}
      {rows.length === 0 && (
        <p className="py-10 text-center text-sm text-neutral-400">
          No blocks yet. Use Edit to add some.
        </p>
      )}
      {rows.map((row, i) => {
        const key = rowKey(row);
        const settings = rowSettingsOf(layout, key);
        const above = i > 0 ? rowSettingsOf(layout, rowKey(rows[i - 1])).below : 0;
        return (
          <div
            key={key}
            className={rowClass(settings.horizontal, settings.vertical)}
            style={{ marginTop: above, gap: settings.between }}
          >
            {row.map((b) => (
              <div key={b.id} className={ROW_BLOCK_CLASS} style={rowBlockStyle(blockWidthOf(b))}>
                <Labelled label={blockLabel(b)}>
                  <BlockShape block={b} spacing={layout.gridSpacing} />
                </Labelled>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Where the example curations sit in the Canvas preview, as % of the
// preview area.
const CANVAS_EXAMPLE_TILES: [number, number][] = [
  [4, 6],
  [38, 4],
  [74, 8],
  [6, 64],
  [76, 60],
  [40, 76],
];

// The gap between an opened curation's images in the Canvas preview.
const CANVAS_PREVIEW_GAP = 4;

// A Canvas style: example curation tiles scattered at half the style's
// tile size, and the one in the centre open as on a page (CanvasPlayer)
// — a 3 × 3 grid, the first work filling a 2 × 2 corner at the style's
// Opened size, the next five below it and down its right-hand side.
function CanvasPreview({ layout }: { layout: CanvasLayout }) {
  const size = Math.round(layout.tileSize / 2);
  const small = Math.round((size * layout.openScale - CANVAS_PREVIEW_GAP) / 2);
  return (
    <div
      className="relative h-[520px] overflow-hidden rounded-md border border-dashed border-neutral-300"
      style={{ backgroundColor: layout.backgroundColor ?? undefined }}
    >
      <span className="absolute left-2 top-2 z-10 rounded bg-white/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
        Canvas — curations placed on each page, scrolls in any direction
      </span>
      {CANVAS_EXAMPLE_TILES.map(([x, y], i) => (
        <div
          key={i}
          className="absolute flex items-center justify-center rounded bg-neutral-200 text-[10px] uppercase tracking-wide text-neutral-400"
          style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }}
        >
          Curation
        </div>
      ))}
      <div
        className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-dashed border-neutral-400 bg-white/70 p-1.5"
        style={{
          gridTemplateColumns: `repeat(3, ${small}px)`,
          gridAutoRows: `${small}px`,
          gap: CANVAS_PREVIEW_GAP,
        }}
      >
        <div className="col-span-2 row-span-2 flex items-center justify-center rounded bg-neutral-300 text-[10px] uppercase tracking-wide text-neutral-500">
          Opened
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="rounded bg-neutral-200" />
        ))}
      </div>
    </div>
  );
}

// One part of a Section — a row of its own: its width, its alignment
// and the space above it.
function Part({
  width,
  align,
  above = 0,
  children,
}: {
  width: number;
  align: HorizontalAlign;
  above?: number;
  children: ReactNode;
}) {
  return (
    <div className={rowClass(align, "top")} style={{ marginTop: above }}>
      <div className={ROW_BLOCK_CLASS} style={rowBlockStyle(width)}>
        {children}
      </div>
    </div>
  );
}

function blockLabel(block: LayoutBlock): string {
  const label = blockTypeLabel(block.type);
  const width = blockWidthOf(block) < 100 ? `, ${blockWidthOf(block)}% wide` : "";
  const d = block.doors;
  if (!d) return `${label}${width}`;
  const panels = `square panels ${d.height.desktop}% of screen high (phone ${d.height.phone}%)`;
  return d.perSlide === 1
    ? `${label} — one at a time from the page's curation, ${d.duration}s, slide ${d.speed}s, ${panels}${width}`
    : `${label} — pairs from the page's curation, ${d.duration}s, slide ${d.speed}s, gap ${d.gap}px, ${panels}${width}`;
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
      // Square panels, as on the page.
      const single = block.doors?.perSlide === 1;
      return (
        <div
          className="relative flex h-48 justify-center"
          style={{ gap: single ? 0 : (block.doors?.gap ?? 0) }}
        >
          <div className="aspect-square h-full rounded bg-neutral-200" />
          {!single && <div className="aspect-square h-full rounded bg-neutral-200" />}
          <span className="absolute inset-0 flex items-center justify-center gap-10 text-2xl text-neutral-400">
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
