import {
  blockTypeLabel,
  type CanvasLayout,
  type LayoutBlock,
  type PageStyleLayout,
} from "@/lib/pageStyleLayout";
import { blockWidthOf, groupBlocksByRow, rowKey, rowSettingsOf } from "@/lib/rowLayout";
import { PAGE_MARGIN_CLASS, pageMarginStyle } from "@/components/pageMargins";
import { rowBlockClass, rowBlockStyle, rowClass } from "@/components/pageRows";
import { BlockShape, Labelled } from "@/components/blockShapes";

// Draws a Page Style's layout as grey placeholders (2026-10-04) — what
// goes where on the page, with no content. Used by the Page Styles
// page's Preview panel. Uses the style's grid spacing, block spacing,
// block widths, page margin (2026-10-06) and row alignment (2026-10-07),
// drawn the same way as the site's pages (see components/pageRows.ts).
// Each block's outline is drawn by BlockShape (components/blockShapes),
// so a block looks the same here as in the visual editor and Arrange.
export default function PageStylePreview({ style }: { style: PageStyleLayout }) {
  if (style.type === "CANVAS") return <CanvasPreview layout={style.layout} />;

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
              <div key={b.id} className={rowBlockClass()} style={rowBlockStyle(blockWidthOf(b))}>
                <Labelled label={blockLabel(b)}>
                  <BlockShape type={b.type} doors={b.doors} spacing={layout.gridSpacing} />
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
