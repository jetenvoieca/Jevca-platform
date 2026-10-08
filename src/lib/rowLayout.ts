// The row-and-component layout shared by every visual editor
// (2026-10-08, moved out of lib/pageStyleLayout.ts so Mail Templates can
// use it too): components placed in rows, side by side or alone, each
// with a width, every row with its own spacing and alignment, inside a
// margin set separately for desktop and phone. What the components are
// is up to each kind of layout — Page Styles (lib/pageStyleLayout.ts)
// and Mail Templates (lib/mailTemplateLayout.ts) each have their own.
// Plain module, not "use server", so editors, previews and server
// actions all share the same shape and the same clean-up rules.

// ─── Numbers and colours ──────────────────────────────────────────────

// A number within its limits, rounded to `decimals` places; anything
// else becomes the default.
export function cleanNumber(
  value: unknown,
  limits: { min: number; max: number },
  fallback: number,
  decimals: number
): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const factor = 10 ** decimals;
  return Math.round(Math.min(limits.max, Math.max(limits.min, n)) * factor) / factor;
}

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

// A #rrggbb colour, or null.
export function cleanColour(value: unknown): string | null {
  return typeof value === "string" && HEX_COLOUR.test(value) ? value : null;
}

// ─── Margins ──────────────────────────────────────────────────────────

// The margin (2026-10-06, from Craig's request for more breathing
// space): the space between the edges and the contents, in pixels —
// vertical = top and bottom, horizontal = left and right — set
// separately for desktop and phone (narrower than 768px). The
// background colour shows in it.
export type PageMargin = { vertical: number; horizontal: number };
export type PageMargins = { desktop: PageMargin; phone: PageMargin };

export const DEFAULT_PAGE_MARGIN: PageMargin = { vertical: 16, horizontal: 16 };

export const DEFAULT_PAGE_MARGINS: PageMargins = {
  desktop: DEFAULT_PAGE_MARGIN,
  phone: DEFAULT_PAGE_MARGIN,
};

export const PAGE_MARGIN_LIMITS = { min: 0, max: 300 } as const;

function cleanPageMargin(raw: unknown, fallback: PageMargin): PageMargin {
  const value = (raw ?? {}) as Partial<Record<keyof PageMargin, unknown>>;
  return {
    vertical: cleanNumber(value.vertical, PAGE_MARGIN_LIMITS, fallback.vertical, 0),
    horizontal: cleanNumber(value.horizontal, PAGE_MARGIN_LIMITS, fallback.horizontal, 0),
  };
}

// Anything missing gets `fallback` (the default margins unless given).
export function cleanPageMargins(
  raw: unknown,
  fallback: PageMargins = DEFAULT_PAGE_MARGINS
): PageMargins {
  const value = (raw ?? {}) as Partial<Record<keyof PageMargins, unknown>>;
  return {
    desktop: cleanPageMargin(value.desktop, fallback.desktop),
    phone: cleanPageMargin(value.phone, fallback.phone),
  };
}

// ─── Grid spacing ─────────────────────────────────────────────────────

// The space between images in a grid of images (2026-10-05) — every
// Gallery component in a layout — in pixels: vertical = between rows,
// horizontal = between columns. One setting per layout.
export type GridSpacing = { vertical: number; horizontal: number };

export const DEFAULT_GRID_SPACING: GridSpacing = { vertical: 8, horizontal: 8 };

export const GRID_SPACING_LIMITS = {
  vertical: { min: 0, max: 100 },
  horizontal: { min: 0, max: 100 },
} as const;

export function cleanGridSpacing(raw: unknown): GridSpacing {
  const value = (raw ?? {}) as Partial<Record<keyof GridSpacing, unknown>>;
  const d = DEFAULT_GRID_SPACING;
  const l = GRID_SPACING_LIMITS;
  return {
    vertical: cleanNumber(value.vertical, l.vertical, d.vertical, 0),
    horizontal: cleanNumber(value.horizontal, l.horizontal, d.horizontal, 0),
  };
}

// ─── Spacing, widths and alignment ────────────────────────────────────

// The space between components (2026-10-05), in pixels — set separately
// for every gap, for more open layouts.
export const DEFAULT_BLOCK_SPACING = 16;
export const BLOCK_SPACING_LIMITS = { min: 0, max: 200 } as const;

// A component's width on desktop (2026-10-05), as a percentage of the
// width inside the margin; a narrower component sits as its row's
// alignment says. Components side by side each keep their own width,
// placed together, with the rest left as space — if together they're
// wider than the space, they shrink to fit. On a phone every component
// is full width (2026-10-07).
export const DEFAULT_BLOCK_WIDTH = 100;
export const BLOCK_WIDTH_LIMITS = { min: 10, max: 100 } as const;

export function cleanBlockSpacing(value: unknown): number {
  return cleanNumber(value, BLOCK_SPACING_LIMITS, DEFAULT_BLOCK_SPACING, 0);
}

export function cleanBlockWidth(value: unknown): number {
  return cleanNumber(value, BLOCK_WIDTH_LIMITS, DEFAULT_BLOCK_WIDTH, 0);
}

// How a row sits on desktop (2026-10-07): `horizontal` places its
// components together left, centred or right; `vertical` lines up
// side-by-side components of different heights at their tops, middles
// or bottoms. On a phone every component is stacked full width, so
// alignment applies from desktop width up only.
const HORIZONTAL_ALIGNS = ["left", "center", "right"] as const;
export type HorizontalAlign = (typeof HORIZONTAL_ALIGNS)[number];

const VERTICAL_ALIGNS = ["top", "middle", "bottom"] as const;
export type VerticalAlign = (typeof VERTICAL_ALIGNS)[number];

// One row: `below` = the space between this row and the next (unused on
// the last row), `between` = the space between its components when they
// sit side by side (and between them when stacked on a phone), plus its
// alignment.
export type RowSettings = {
  below: number;
  between: number;
  horizontal: HorizontalAlign;
  vertical: VerticalAlign;
};

const DEFAULT_ROW_SETTINGS: RowSettings = {
  below: DEFAULT_BLOCK_SPACING,
  between: DEFAULT_BLOCK_SPACING,
  horizontal: "center",
  vertical: "top",
};

function cleanRowSettings(raw: unknown): RowSettings {
  const value = (raw ?? {}) as Partial<Record<keyof RowSettings, unknown>>;
  return {
    below: cleanBlockSpacing(value.below),
    between: cleanBlockSpacing(value.between),
    horizontal: HORIZONTAL_ALIGNS.find((a) => a === value.horizontal) ?? "center",
    vertical: VERTICAL_ALIGNS.find((a) => a === value.vertical) ?? "top",
  };
}

// ─── Components and rows ──────────────────────────────────────────────

// One component: `row` — components sharing a row id sit side by side
// (see groupBlocksByRow). `width` is unset until changed (see
// blockWidthOf). Each kind of layout adds its own fields.
export type RowBlock<T extends string = string> = {
  id: string;
  type: T;
  row?: string;
  width?: number;
};

// What every row-based layout has: its margin, each row's settings by
// rowKey() (a row with no entry uses the defaults) and its components.
export type RowLayout<B extends RowBlock = RowBlock> = {
  margins: PageMargins;
  rows: Record<string, RowSettings>;
  blocks: B[];
};

// Groups the components into the rows they're drawn as: a run of
// components sharing the same `row` id is one row, side by side; any
// other component is a row of its own.
export function groupBlocksByRow<B extends RowBlock>(blocks: B[]): B[][] {
  const groups: B[][] = [];
  for (const block of blocks) {
    const current = groups[groups.length - 1];
    if (block.row && current && current[0].row === block.row) {
      current.push(block);
    } else {
      groups.push([block]);
    }
  }
  return groups;
}

// What a row's settings are stored under: its row id when its
// components sit side by side, otherwise its one component's id. When
// components are added, moved or removed, each row's settings follow
// its components (see rebuildRows).
export function rowKey(row: RowBlock[]): string {
  return row[0].row ?? row[0].id;
}

export function rowSettingsOf(layout: RowLayout, key: string): RowSettings {
  return layout.rows[key] ?? DEFAULT_ROW_SETTINGS;
}

export function blockWidthOf(block: RowBlock): number {
  return block.width ?? DEFAULT_BLOCK_WIDTH;
}

// The id, type, row and width every component has, cleaned — or null
// when it isn't a component of this kind of layout. Each layout's own
// fields are added by its own normalize.
export function cleanRowBlock<T extends string>(
  raw: unknown,
  isType: (value: unknown) => value is T
): RowBlock<T> | null {
  const block = raw as Partial<RowBlock> | null;
  if (typeof block?.id !== "string" || !isType(block.type)) return null;
  const clean: RowBlock<T> = { id: block.id, type: block.type };
  if (typeof block.row === "string") clean.row = block.row;
  if (block.width !== undefined) clean.width = cleanBlockWidth(block.width);
  return clean;
}

// A row needs at least two components; a lone one goes back to full
// width. Everything else about the component is kept.
export function clearLoneRows<B extends RowBlock>(blocks: B[]): B[] {
  return groupBlocksByRow(blocks).flatMap((g) => (g.length > 1 ? g : [withoutRow(g[0])]));
}

function withoutRow<B extends RowBlock>(block: B): B {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { row, ...rest } = block;
  return rest as B;
}

// Keeps settings only for rows that still exist.
export function cleanRows(raw: unknown, blocks: RowBlock[]): Record<string, RowSettings> {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, RowSettings> = {};
  for (const row of groupBlocksByRow(blocks)) {
    const key = rowKey(row);
    const entry = value[key];
    if (entry && typeof entry === "object") out[key] = cleanRowSettings(entry);
  }
  return out;
}

// ─── Snapping ─────────────────────────────────────────────────────────

// The widths a component snaps to while its edge is dragged in a visual
// editor (2026-10-07, Craig's choice: tidy fractions, the same
// everywhere). Stored as whole percentages.
const WIDTH_SNAPS = [
  { value: 25, label: "¼" },
  { value: 33, label: "⅓" },
  { value: 50, label: "½" },
  { value: 67, label: "⅔" },
  { value: 75, label: "¾" },
  { value: 100, label: "Full" },
] as const;

export function snapBlockWidth(raw: number): number {
  return WIDTH_SNAPS.reduce((best, s) =>
    Math.abs(s.value - raw) < Math.abs(best.value - raw) ? s : best
  ).value;
}

// "½ width", or the exact % for a width set some other way.
export function blockWidthLabel(width: number): string {
  const snap = WIDTH_SNAPS.find((s) => s.value === width);
  return snap ? `${snap.label} width` : `${width}% width`;
}

// Spacing and margins dragged in a visual editor move in steps of this
// many pixels, within their limits.
const SPACING_STEP = 4;

export function snapSpacing(raw: number, limits: { min: number; max: number }): number {
  const stepped = Math.round(raw / SPACING_STEP) * SPACING_STEP;
  return Math.min(limits.max, Math.max(limits.min, stepped));
}

// ─── Editing ──────────────────────────────────────────────────────────

// Where a dragged component lands (2026-10-07): a new row of its own
// before row `index` (rows counted as they are before the move; the row
// count = at the end), or beside another component in its row.
export type BlockDropTarget =
  | { kind: "row"; index: number }
  | { kind: "beside"; blockId: string; side: "left" | "right" };

// Puts a component — new, or already in the layout (a move) — at
// `target`. Each row keeps its spacing and alignment as long as any of
// its other components stay in it; a component moved into a row of its
// own keeps its old row's settings only if it was alone there.
export function placeLayoutBlock<B extends RowBlock, L extends RowLayout<B>>(
  layout: L,
  block: B,
  target: BlockDropTarget
): L {
  if (target.kind === "beside" && target.blockId === block.id) return layout;
  const before = groupBlocksByRow(layout.blocks);
  const groups: B[][] = [];
  let insertAt = -1;
  before.forEach((g, i) => {
    if (target.kind === "row" && i === target.index) insertAt = groups.length;
    const rest = g.filter((b) => b.id !== block.id);
    if (rest.length > 0) groups.push(rest);
  });

  const moving = withoutRow(block);
  if (target.kind === "row") {
    groups.splice(insertAt < 0 ? groups.length : insertAt, 0, [moving]);
  } else {
    const group = groups.find((g) => g.some((b) => b.id === target.blockId));
    if (!group) return layout;
    const at = group.findIndex((b) => b.id === target.blockId) + (target.side === "right" ? 1 : 0);
    group.splice(at, 0, moving);
  }
  return rebuildRows(layout, groups, block.id);
}

export function removeLayoutBlock<B extends RowBlock, L extends RowLayout<B>>(
  layout: L,
  id: string
): L {
  const groups = groupBlocksByRow(layout.blocks)
    .map((g) => g.filter((b) => b.id !== id))
    .filter((g) => g.length > 0);
  return rebuildRows(layout, groups, id);
}

// Turns rows (as lists of components) back into the stored components
// and row settings. A row of two or more keeps its row id unless that
// id is also a component's id elsewhere (row ids used to be a
// component's id), when it gets a fresh one; its settings follow its
// components.
function rebuildRows<B extends RowBlock, L extends RowLayout<B>>(
  layout: L,
  groups: B[][],
  movedId: string
): L {
  const settingsByBlock = new Map<string, RowSettings>();
  let movedWasAlone = false;
  for (const g of groupBlocksByRow(layout.blocks)) {
    const settings = layout.rows[rowKey(g)];
    if (g.length === 1 && g[0].id === movedId) movedWasAlone = true;
    if (settings) for (const b of g) settingsByBlock.set(b.id, settings);
  }
  const blockIds = new Set(groups.flat().map((b) => b.id));

  const blocks: B[] = [];
  const rows: Record<string, RowSettings> = {};
  for (const g of groups) {
    const kept = g.find((b) => b.id !== movedId);
    const settings = kept
      ? settingsByBlock.get(kept.id)
      : movedWasAlone
        ? settingsByBlock.get(movedId)
        : undefined;
    let key: string;
    if (g.length === 1) {
      key = g[0].id;
      blocks.push(withoutRow(g[0]));
    } else {
      const candidate = kept?.row ?? kept?.id;
      const clashes =
        candidate !== undefined && blockIds.has(candidate) && !g.some((b) => b.id === candidate);
      key = candidate && !clashes ? candidate : crypto.randomUUID();
      blocks.push(...g.map((b) => ({ ...b, row: key })));
    }
    if (settings) rows[key] = settings;
  }
  return { ...layout, blocks, rows };
}

// Changes one row's settings, kept within their limits.
export function updateRowSettings<L extends RowLayout>(
  layout: L,
  key: string,
  patch: Partial<RowSettings>
): L {
  return {
    ...layout,
    rows: { ...layout.rows, [key]: cleanRowSettings({ ...rowSettingsOf(layout, key), ...patch }) },
  };
}

// Changes one component's width, kept within its limits.
export function updateBlockWidth<B extends RowBlock>(blocks: B[], id: string, width: number): B[] {
  return blocks.map((b) => (b.id === id ? { ...b, width: cleanBlockWidth(width) } : b));
}

// Replaces one component (its own settings changed).
export function replaceBlock<B extends RowBlock>(blocks: B[], block: B): B[] {
  return blocks.map((b) => (b.id === block.id ? block : b));
}
