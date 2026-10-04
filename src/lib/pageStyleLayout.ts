import { groupBlocksByRow } from "@/lib/blocks";
import type { PageStyleType } from "@/lib/pageStyleTypes";

// The layout a Page Style holds (2026-10-04) — the arrangement of
// components only, never content. Saved in PageStyle.layout (JSON).
// Plain module, not "use server", so the modal, the preview and the
// server actions all share the same shape and the same clean-up rules.

// The components a Private / Custom style can be built from — the same
// block types as the old block editor (see ContentBlock in blocks.ts),
// as empty placeholders.
export const LAYOUT_BLOCK_TYPES = [
  { value: "header", label: "Header" },
  { value: "text", label: "Text" },
  { value: "image", label: "Single Image" },
  { value: "gallery", label: "Gallery" },
  { value: "artwork", label: "Artwork Feature" },
  { value: "video", label: "Video" },
  { value: "textgrid", label: "Text Grid" },
] as const;

export type LayoutBlockType = (typeof LAYOUT_BLOCK_TYPES)[number]["value"];

// `row` works as in blocks.ts: placeholders sharing a row id sit side
// by side.
export type LayoutBlock = { id: string; type: LayoutBlockType; row?: string };

export type CustomLayout = {
  // A colour is styling, so the style keeps it; null = none.
  backgroundColor: string | null;
  // Whether the page has a background image — the image itself is
  // content, chosen on the page later.
  backgroundImage: boolean;
  blocks: LayoutBlock[];
};

// Section is a fixed layout — a byline and an artwork grid filled from
// the page's curation — with no settings of its own yet.
export type SectionLayout = Record<string, never>;

export type PageStyleLayout =
  | { type: "SECTION"; layout: SectionLayout }
  | { type: "PRIVATE"; layout: CustomLayout };

export function blockTypeLabel(type: LayoutBlockType): string {
  return LAYOUT_BLOCK_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function emptyLayout(type: PageStyleType): PageStyleLayout {
  return type === "SECTION"
    ? { type, layout: {} }
    : { type, layout: { backgroundColor: null, backgroundImage: false, blocks: [] } };
}

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

function isLayoutBlockType(value: unknown): value is LayoutBlockType {
  return LAYOUT_BLOCK_TYPES.some((t) => t.value === value);
}

// Turns whatever is stored (or sent from the browser) into a valid
// layout for the type — anything unknown or malformed is dropped, so a
// bad value can never break the modal, the preview or a page.
export function normalizeLayout(type: PageStyleType, raw: unknown): PageStyleLayout {
  if (type === "SECTION") return { type, layout: {} };

  const value = (raw ?? {}) as Partial<Record<keyof CustomLayout, unknown>>;
  const blocks = Array.isArray(value.blocks)
    ? value.blocks.flatMap((b): LayoutBlock[] => {
        const block = b as Partial<LayoutBlock>;
        if (typeof block?.id !== "string" || !isLayoutBlockType(block.type)) return [];
        return [
          typeof block.row === "string"
            ? { id: block.id, type: block.type, row: block.row }
            : { id: block.id, type: block.type },
        ];
      })
    : [];

  return {
    type,
    layout: {
      backgroundColor:
        typeof value.backgroundColor === "string" && HEX_COLOUR.test(value.backgroundColor)
          ? value.backgroundColor
          : null,
      backgroundImage: value.backgroundImage === true,
      blocks: clearLoneRows(blocks),
    },
  };
}

// A row needs at least two placeholders; a lone one goes back to full width.
function clearLoneRows(blocks: LayoutBlock[]): LayoutBlock[] {
  const groups = groupBlocksByRow(blocks);
  return groups.flatMap((g) => (g.length === 1 ? [{ id: g[0].id, type: g[0].type }] : g));
}

// Adds a placeholder at the end, or — with "left"/"right" — beside the
// last row, same as the old block editor's To left / To Right.
export function addLayoutBlock(
  blocks: LayoutBlock[],
  type: LayoutBlockType,
  placement: "none" | "left" | "right"
): LayoutBlock[] {
  const block: LayoutBlock = { id: crypto.randomUUID(), type };
  if (placement === "none" || blocks.length === 0) return [...blocks, block];

  const groups = groupBlocksByRow(blocks);
  const last = groups[groups.length - 1];
  const row = last[0].row ?? crypto.randomUUID();
  const before = groups.slice(0, -1).flat();
  const lastRow = last.map((b) => ({ ...b, row }));
  const paired = { ...block, row };
  return [...before, ...(placement === "left" ? [paired, ...lastRow] : [...lastRow, paired])];
}

export function removeLayoutBlock(blocks: LayoutBlock[], id: string): LayoutBlock[] {
  return clearLoneRows(blocks.filter((b) => b.id !== id));
}

// Moves a whole row (one or more placeholders) up or down.
export function moveLayoutRow(blocks: LayoutBlock[], rowIndex: number, direction: -1 | 1) {
  const groups = groupBlocksByRow(blocks);
  const target = rowIndex + direction;
  if (target < 0 || target >= groups.length) return blocks;
  [groups[rowIndex], groups[target]] = [groups[target], groups[rowIndex]];
  return groups.flat();
}
