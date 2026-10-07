"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { groupBlocksByRow } from "@/lib/blocks";
import {
  BLOCK_SPACING_LIMITS,
  LAYOUT_BLOCK_TYPES,
  PAGE_MARGIN_LIMITS,
  blockTypeLabel,
  blockWidthLabel,
  blockWidthOf,
  cleanPageMargins,
  newLayoutBlock,
  placeLayoutBlock,
  removeLayoutBlock,
  rowKey,
  rowSettingsOf,
  snapBlockWidth,
  snapSpacing,
  updateBlockWidth,
  updateRowSettings,
  type BlockDropTarget,
  type CustomLayout,
  type HorizontalAlign,
  type LayoutBlock,
  type LayoutBlockType,
  type PageMargin,
  type VerticalAlign,
} from "@/lib/pageStyleLayout";
import { rowBlockClass, rowBlockStyle, rowClass, type PreviewDevice } from "@/components/pageRows";
import { BlockShape, Labelled } from "@/components/PageStylePreview";

// The visual editor for a Private / Custom Page Style (2026-10-07, from
// Craig's request to replace the numbers with something he can see):
// the page itself, drawn as on a desktop (1280px wide) or a phone (390px
// wide), shrunk to fit the panel, and edited by hand.
// - Add: drag a component from the tray onto the page (or click it to
//   add it at the end). A blue line shows where it will land: above or
//   below a row, or beside a component (desktop only).
// - Move: drag a component the same way.
// - Size: select a component and drag its edge; it snaps to ¼ ⅓ ½ ⅔ ¾
//   or full width (desktop only — on a phone every component is full
//   width).
// - Spacing: the shaded strips are the gaps between rows, between
//   side-by-side components and the page margin; drag one to change it
//   (in steps of 4px). Margins are set separately for desktop and phone.
// - Align: a selected component's bar sets its row's alignment — left,
//   centre or right, and for side-by-side components top, middle or
//   bottom (desktop only). The bar also removes it (as does Delete).
// Every change goes straight to `onChange`, which saves it.

const FRAME_WIDTH: Record<PreviewDevice, number> = { desktop: 1280, phone: 390 };

type DragItem = { kind: "new"; type: LayoutBlockType } | { kind: "move"; block: LayoutBlock };

// What a component's drop zone knows about where it is.
type DropData = { blockId: string; rowIndex: number };

// How much the page is shrunk to fit — pointer movements on screen are
// divided by it to get page pixels, and the editor's own controls are
// grown by it so they stay a readable size.
const ScaleContext = createContext(1);

export default function VisualLayoutEditor({
  layout,
  onChange,
}: {
  layout: CustomLayout;
  onChange: (layout: CustomLayout) => void;
}) {
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<BlockDropTarget | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const rows = groupBlocksByRow(layout.blocks);

  // Delete removes the selected component; Escape lets go of it.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onChange(removeLayoutBlock(layout, selectedId));
        setSelectedId(null);
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, layout, onChange]);

  const place = (block: LayoutBlock, target: BlockDropTarget) => {
    const next = placeLayoutBlock(layout, block, target);
    if (next !== layout) onChange(next);
  };

  const handleDragStart = (e: DragStartEvent) => {
    const item = e.active.data.current as DragItem | undefined;
    setDragging(item ?? null);
    setDropTarget(null);
  };

  // Works out the landing place from the pointer's position over a
  // component: its top or bottom quarter = a row of its own above or
  // below that row; otherwise beside it, on the side the pointer is on.
  // On a phone components stack, so it's always above or below.
  const handleDragMove = (e: DragMoveEvent) => {
    const item = e.active.data.current as DragItem | undefined;
    const start = e.activatorEvent as PointerEvent;
    const over = e.over;
    let target: BlockDropTarget | null = null;
    if (item && over) {
      if (over.id === "end") {
        target = { kind: "row", index: rows.length };
      } else {
        const { blockId, rowIndex } = over.data.current as DropData;
        const x = start.clientX + e.delta.x;
        const y = start.clientY + e.delta.y;
        const r = over.rect;
        const fromTop = (y - r.top) / r.height;
        if (device === "phone" || fromTop < 0.25 || fromTop > 0.75) {
          target = { kind: "row", index: fromTop < 0.5 ? rowIndex : rowIndex + 1 };
        } else {
          target = { kind: "beside", blockId, side: x < r.left + r.width / 2 ? "left" : "right" };
        }
      }
      if (target && item.kind === "move" && changesNothing(rows, item.block.id, target)) {
        target = null;
      }
    }
    setDropTarget((current) =>
      JSON.stringify(current) === JSON.stringify(target) ? current : target
    );
  };

  const handleDragEnd = () => {
    if (dragging && dropTarget) {
      if (dragging.kind === "new") {
        const block = newLayoutBlock(dragging.type);
        place(block, dropTarget);
        setSelectedId(block.id);
      } else {
        place(dragging.block, dropTarget);
      }
    }
    setDragging(null);
    setDropTarget(null);
  };

  const handleDragCancel = () => {
    setDragging(null);
    setDropTarget(null);
  };

  const addAtEnd = (type: LayoutBlockType) => {
    const block = newLayoutBlock(type);
    place(block, { kind: "row", index: rows.length });
    setSelectedId(block.id);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex min-h-0 flex-1 gap-3">
        <aside className="flex w-36 shrink-0 flex-col gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Components</p>
          {LAYOUT_BLOCK_TYPES.map((t) => (
            <TrayItem key={t.value} type={t.value} label={t.label} onAdd={addAtEnd} />
          ))}
          <p className="mt-1 text-xs text-neutral-400">
            Drag onto the page, or click to add at the end.
          </p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex rounded-md border border-neutral-300 p-0.5">
              {(["desktop", "phone"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  className={`rounded px-3 py-1 text-sm ${
                    device === d
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {d === "desktop" ? "Desktop" : "Phone"}
                </button>
              ))}
            </div>
            <p className="text-right text-xs text-neutral-400">
              {device === "desktop"
                ? "Drag the shaded strips to change spacing and margins."
                : "On a phone every component is full width, stacked. Widths and alignment are set in Desktop."}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pt-12">
            <ScaledFrame width={FRAME_WIDTH[device]}>
              <Page
                layout={layout}
                device={device}
                selectedId={selectedId}
                draggingId={dragging?.kind === "move" ? dragging.block.id : null}
                dropTarget={dropTarget}
                onSelect={setSelectedId}
                onChange={onChange}
              />
            </ScaledFrame>
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="rounded-md border border-blue-500 bg-white px-3 py-2 text-sm text-neutral-800 shadow-md">
            {blockTypeLabel(dragging.kind === "new" ? dragging.type : dragging.block.type)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// Whether dropping a block at `target` would leave the layout as it is:
// a block alone in its row dropped just above or below itself.
function changesNothing(rows: LayoutBlock[][], blockId: string, target: BlockDropTarget): boolean {
  if (target.kind === "beside") return target.blockId === blockId;
  const index = rows.findIndex((r) => r.some((b) => b.id === blockId));
  return rows[index]?.length === 1 && (target.index === index || target.index === index + 1);
}

function TrayItem({
  type,
  label,
  onAdd,
}: {
  type: LayoutBlockType;
  label: string;
  onAdd: (type: LayoutBlockType) => void;
}) {
  const item: DragItem = { kind: "new", type };
  const { setNodeRef, attributes, listeners } = useDraggable({ id: `new:${type}`, data: item });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onAdd(type)}
      {...attributes}
      {...listeners}
      className="cursor-grab rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-left text-sm text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50 active:cursor-grabbing"
    >
      {label}
    </button>
  );
}

// Draws the page at its real width, shrunk to fit the space available.
function ScaledFrame({ width, children }: { width: number; children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => {
      setScale(Math.min(1, outer.clientWidth / width));
      setHeight(inner.offsetHeight);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    measure();
    return () => observer.disconnect();
  }, [width]);

  return (
    // inline-size containment: the page's own width never stretches the
    // panel it sits in, so it's always measured and shrunk to the panel.
    <div ref={outerRef} className="w-full" style={{ contain: "inline-size" }}>
      <div
        className="mx-auto"
        style={{ width: width * scale, height: height * scale, overflowX: "clip" }}
      >
        <div ref={innerRef} style={{ width, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
          <ScaleContext.Provider value={scale}>{children}</ScaleContext.Provider>
        </div>
      </div>
    </div>
  );
}

// Starts a pointer drag on a handle: `onDrag` gets how far the pointer
// has moved since it went down, in page pixels (screen pixels divided by
// the page's `scale`).
function startHandleDrag(
  e: ReactPointerEvent<HTMLElement>,
  scale: number,
  onDrag: (dx: number, dy: number) => void,
  onEnd?: () => void
) {
  e.preventDefault();
  e.stopPropagation();
  const el = e.currentTarget;
  el.setPointerCapture(e.pointerId);
  const startX = e.clientX;
  const startY = e.clientY;
  const move = (ev: PointerEvent) =>
    onDrag((ev.clientX - startX) / scale, (ev.clientY - startY) / scale);
  const end = () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", end);
    el.removeEventListener("pointercancel", end);
    onEnd?.();
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

function Page({
  layout,
  device,
  selectedId,
  draggingId,
  dropTarget,
  onSelect,
  onChange,
}: {
  layout: CustomLayout;
  device: PreviewDevice;
  selectedId: string | null;
  draggingId: string | null;
  dropTarget: BlockDropTarget | null;
  onSelect: (id: string | null) => void;
  onChange: (layout: CustomLayout) => void;
}) {
  const rows = groupBlocksByRow(layout.blocks);
  const margin = layout.margins[device];
  const contentWidth = FRAME_WIDTH.desktop - 2 * layout.margins.desktop.horizontal;

  const setMargin = (patch: Partial<PageMargin>) =>
    onChange({
      ...layout,
      margins: cleanPageMargins({ ...layout.margins, [device]: { ...margin, ...patch } }),
    });

  return (
    <div
      onClick={() => onSelect(null)}
      className={`relative min-h-[640px] bg-white ${
        layout.backgroundImage
          ? "outline-dashed outline-2 -outline-offset-2 outline-neutral-300"
          : ""
      }`}
      style={{
        padding: `${margin.vertical}px ${margin.horizontal}px`,
        backgroundColor: layout.backgroundColor ?? undefined,
      }}
    >
      <MarginHandle side="top" margin={margin} onChange={setMargin} />
      <MarginHandle side="bottom" margin={margin} onChange={setMargin} />
      <MarginHandle side="left" margin={margin} onChange={setMargin} />
      <MarginHandle side="right" margin={margin} onChange={setMargin} />

      {rows.map((row, i) => {
        const key = rowKey(row);
        const settings = rowSettingsOf(layout, key);
        const setRow = (patch: Parameters<typeof updateRowSettings>[2]) =>
          onChange(updateRowSettings(layout, key, patch));
        return (
          <div key={key}>
            {i > 0 && (
              <SpacingHandle
                direction="vertical"
                value={rowSettingsOf(layout, rowKey(rows[i - 1])).below}
                onChange={(below) =>
                  onChange(updateRowSettings(layout, rowKey(rows[i - 1]), { below }))
                }
              />
            )}
            <DropLine show={dropTarget?.kind === "row" && dropTarget.index === i} />
            <div className={rowClass(settings.horizontal, settings.vertical, device)}>
              {row.map((b, j) => (
                <BlockWithGap
                  key={b.id}
                  first={j === 0}
                  between={settings.between}
                  device={device}
                  onBetween={(between) => setRow({ between })}
                >
                  <BlockItem
                    block={b}
                    rowIndex={i}
                    rowSize={row.length}
                    device={device}
                    horizontal={settings.horizontal}
                    vertical={settings.vertical}
                    contentWidth={contentWidth}
                    selected={b.id === selectedId}
                    faded={b.id === draggingId}
                    dropSide={
                      dropTarget?.kind === "beside" && dropTarget.blockId === b.id
                        ? dropTarget.side
                        : null
                    }
                    gridSpacing={layout.gridSpacing}
                    onSelect={() => onSelect(b.id)}
                    onWidth={(width) =>
                      onChange({ ...layout, blocks: updateBlockWidth(layout.blocks, b.id, width) })
                    }
                    onAlign={(patch) => setRow(patch)}
                    onRemove={() => {
                      onChange(removeLayoutBlock(layout, b.id));
                      onSelect(null);
                    }}
                  />
                </BlockWithGap>
              ))}
            </div>
          </div>
        );
      })}

      <EndZone
        empty={rows.length === 0}
        showLine={dropTarget?.kind === "row" && dropTarget.index === rows.length}
      />
    </div>
  );
}

// A component in its row, with the draggable gap before it when it
// isn't the row's first. The gap is a real element (not CSS gap) so it
// can be dragged.
function BlockWithGap({
  first,
  between,
  device,
  onBetween,
  children,
}: {
  first: boolean;
  between: number;
  device: PreviewDevice;
  onBetween: (value: number) => void;
  children: ReactNode;
}) {
  return (
    <>
      {!first && (
        <SpacingHandle
          direction={device === "phone" ? "vertical" : "horizontal"}
          value={between}
          onChange={onBetween}
        />
      )}
      {children}
    </>
  );
}

function BlockItem({
  block,
  rowIndex,
  rowSize,
  device,
  horizontal,
  vertical,
  contentWidth,
  selected,
  faded,
  dropSide,
  gridSpacing,
  onSelect,
  onWidth,
  onAlign,
  onRemove,
}: {
  block: LayoutBlock;
  rowIndex: number;
  rowSize: number;
  device: PreviewDevice;
  horizontal: HorizontalAlign;
  vertical: VerticalAlign;
  contentWidth: number;
  selected: boolean;
  faded: boolean;
  dropSide: "left" | "right" | null;
  gridSpacing: CustomLayout["gridSpacing"];
  onSelect: () => void;
  onWidth: (width: number) => void;
  onAlign: (patch: { horizontal?: HorizontalAlign; vertical?: VerticalAlign }) => void;
  onRemove: () => void;
}) {
  const item: DragItem = { kind: "move", block };
  const drop: DropData = { blockId: block.id, rowIndex };
  const drag = useDraggable({ id: `block:${block.id}`, data: item });
  const zone = useDroppable({ id: `drop:${block.id}`, data: drop });
  const scale = useContext(ScaleContext);
  const [resizing, setResizing] = useState(false);
  const width = blockWidthOf(block);
  const desktop = device === "desktop";

  // Dragging an edge: the new width from how far it has moved, snapped
  // to the nearest fraction. A centred row grows on both sides, so the
  // edge only has to move half as far.
  const resizeFrom = (sign: 1 | -1) => (e: ReactPointerEvent<HTMLElement>) => {
    const factor = horizontal === "center" ? 2 : 1;
    setResizing(true);
    startHandleDrag(
      e,
      scale,
      (dx) => onWidth(snapBlockWidth(width + (sign * factor * dx * 100) / contentWidth)),
      () => setResizing(false)
    );
  };

  // The component itself is what's dragged and dropped onto; its grips,
  // width label and bar sit beside it, so they aren't part of it.
  return (
    <div className={`relative ${rowBlockClass(device)}`} style={rowBlockStyle(width)}>
      <div
        ref={(el) => {
          drag.setNodeRef(el);
          zone.setNodeRef(el);
        }}
        {...drag.attributes}
        {...drag.listeners}
        aria-label={`${blockTypeLabel(block.type)} — drag to move, click to select`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        className={`cursor-grab rounded-md ${
          selected ? "ring-2 ring-blue-500" : "hover:ring-1 hover:ring-blue-300"
        } ${faded ? "opacity-40" : ""}`}
      >
        <Labelled label={blockTypeLabel(block.type)}>
          <BlockShape block={block} spacing={gridSpacing} />
        </Labelled>
      </div>

      {dropSide && (
        <div
          className={`absolute inset-y-0 w-1 rounded bg-blue-500 ${
            dropSide === "left" ? "-left-1" : "-right-1"
          }`}
        />
      )}

      {selected && desktop && horizontal !== "left" && (
        <ResizeGrip side="left" onPointerDown={resizeFrom(-1)} />
      )}
      {selected && desktop && horizontal !== "right" && (
        <ResizeGrip side="right" onPointerDown={resizeFrom(1)} />
      )}
      {resizing && (
        <Unscaled className="pointer-events-none absolute left-1/2 top-1/2 z-30" origin="0 0">
          <span className="block -translate-x-1/2 -translate-y-1/2 rounded bg-blue-600 px-2 py-0.5 text-xs text-white">
            {blockWidthLabel(width)}
          </span>
        </Unscaled>
      )}

      {selected && (
        <Unscaled className="absolute bottom-full left-0 z-30 mb-1" origin="bottom left">
          <Toolbar
            desktop={desktop}
            sideBySide={rowSize > 1}
            horizontal={horizontal}
            vertical={vertical}
            onAlign={onAlign}
            onRemove={onRemove}
          />
        </Unscaled>
      )}
    </div>
  );
}

function ResizeGrip({
  side,
  onPointerDown,
}: {
  side: "left" | "right";
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Drag to resize from the ${side}`}
      className={`absolute top-1/2 z-20 h-16 w-4 -translate-y-1/2 cursor-ew-resize rounded bg-blue-500 hover:bg-blue-600 ${
        side === "left" ? "-left-2" : "-right-2"
      }`}
    />
  );
}

// Keeps the editor's own controls at their normal size however much the
// page is shrunk.
function Unscaled({
  className,
  origin,
  children,
}: {
  className: string;
  origin: string;
  children: ReactNode;
}) {
  const scale = useContext(ScaleContext);
  return (
    <div
      className={className}
      style={{ transform: `scale(${1 / scale})`, transformOrigin: origin }}
    >
      {children}
    </div>
  );
}

const HORIZONTAL_BUTTONS: { value: HorizontalAlign; label: string }[] = [
  { value: "left", label: "Align left" },
  { value: "center", label: "Align centre" },
  { value: "right", label: "Align right" },
];

const VERTICAL_BUTTONS: { value: VerticalAlign; label: string }[] = [
  { value: "top", label: "Line up tops" },
  { value: "middle", label: "Line up middles" },
  { value: "bottom", label: "Line up bottoms" },
];

function Toolbar({
  desktop,
  sideBySide,
  horizontal,
  vertical,
  onAlign,
  onRemove,
}: {
  desktop: boolean;
  sideBySide: boolean;
  horizontal: HorizontalAlign;
  vertical: VerticalAlign;
  onAlign: (patch: { horizontal?: HorizontalAlign; vertical?: VerticalAlign }) => void;
  onRemove: () => void;
}) {
  const button = (active: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded ${
      active ? "bg-blue-100 text-blue-700" : "text-neutral-600 hover:bg-neutral-100"
    }`;
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="flex cursor-default items-center gap-0.5 whitespace-nowrap rounded-md border border-neutral-300 bg-white p-0.5 shadow-sm"
    >
      {desktop &&
        HORIZONTAL_BUTTONS.map((b) => (
          <button
            key={b.value}
            type="button"
            title={b.label}
            aria-label={b.label}
            onClick={() => onAlign({ horizontal: b.value })}
            className={button(horizontal === b.value)}
          >
            <AlignIcon kind={b.value} />
          </button>
        ))}
      {desktop && sideBySide && <span className="mx-0.5 h-5 w-px bg-neutral-200" />}
      {desktop &&
        sideBySide &&
        VERTICAL_BUTTONS.map((b) => (
          <button
            key={b.value}
            type="button"
            title={b.label}
            aria-label={b.label}
            onClick={() => onAlign({ vertical: b.value })}
            className={button(vertical === b.value)}
          >
            <AlignIcon kind={b.value} />
          </button>
        ))}
      {desktop && <span className="mx-0.5 h-5 w-px bg-neutral-200" />}
      <button
        type="button"
        onClick={onRemove}
        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
      >
        Remove
      </button>
    </div>
  );
}

// Small line drawings of each alignment: three bars lined up to one side
// (left / centre / right), or two boxes lined up on one edge (top /
// middle / bottom).
function AlignIcon({ kind }: { kind: HorizontalAlign | VerticalAlign }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": true } as const;
  if (kind === "left" || kind === "center" || kind === "right") {
    const x = (w: number) => (kind === "left" ? 2 : kind === "right" ? 14 - w : 8 - w / 2);
    return (
      <svg {...common} fill="currentColor">
        <rect x={x(12)} y={3} width={12} height={2} rx={1} />
        <rect x={x(8)} y={7} width={8} height={2} rx={1} />
        <rect x={x(10)} y={11} width={10} height={2} rx={1} />
      </svg>
    );
  }
  const y = (h: number) => (kind === "top" ? 2 : kind === "bottom" ? 14 - h : 8 - h / 2);
  return (
    <svg {...common} fill="currentColor">
      <rect x={3} y={y(10)} width={4} height={10} rx={1} />
      <rect x={9} y={y(6)} width={4} height={6} rx={1} />
    </svg>
  );
}

// A shaded, draggable gap: between rows (vertical), or between
// side-by-side components (horizontal). Grabbable even when it's 0.
function SpacingHandle({
  direction,
  value,
  onChange,
}: {
  direction: "vertical" | "horizontal";
  value: number;
  onChange: (value: number) => void;
}) {
  const scale = useContext(ScaleContext);
  const vertical = direction === "vertical";
  const start = (e: ReactPointerEvent<HTMLElement>) =>
    startHandleDrag(e, scale, (dx, dy) =>
      onChange(snapSpacing(value + (vertical ? dy : dx), BLOCK_SPACING_LIMITS))
    );
  return (
    <div
      className={`group relative shrink-0 ${vertical ? "w-full" : "self-stretch"}`}
      style={vertical ? { height: value } : { width: value }}
    >
      <div
        onPointerDown={start}
        onClick={(e) => e.stopPropagation()}
        title="Drag to change the space"
        className={`absolute z-10 rounded-sm bg-blue-100/70 group-hover:bg-blue-200 ${
          vertical
            ? "inset-x-0 -bottom-1 -top-1 cursor-ns-resize"
            : "inset-y-0 -left-1 -right-1 cursor-ew-resize"
        }`}
      />
    </div>
  );
}

// One edge of the page margin, shaded and draggable.
function MarginHandle({
  side,
  margin,
  onChange,
}: {
  side: "top" | "bottom" | "left" | "right";
  margin: PageMargin;
  onChange: (patch: Partial<PageMargin>) => void;
}) {
  const vertical = side === "top" || side === "bottom";
  const value = vertical ? margin.vertical : margin.horizontal;
  // Dragging away from the page's middle makes the margin bigger.
  const sign = side === "top" || side === "left" ? 1 : -1;
  const scale = useContext(ScaleContext);
  const start = (e: ReactPointerEvent<HTMLElement>) =>
    startHandleDrag(e, scale, (dx, dy) => {
      const next = snapSpacing(value + sign * (vertical ? dy : dx), PAGE_MARGIN_LIMITS);
      onChange(vertical ? { vertical: next } : { horizontal: next });
    });
  const size = Math.max(value, 8);
  const position = {
    top: { top: 0, left: 0, right: 0, height: size },
    bottom: { bottom: 0, left: 0, right: 0, height: size },
    left: { top: 0, bottom: 0, left: 0, width: size },
    right: { top: 0, bottom: 0, right: 0, width: size },
  }[side];
  return (
    <div
      onPointerDown={start}
      onClick={(e) => e.stopPropagation()}
      title="Drag to change the page margin"
      className={`absolute z-10 bg-blue-100/50 hover:bg-blue-200/70 ${
        vertical ? "cursor-ns-resize" : "cursor-ew-resize"
      }`}
      style={position}
    />
  );
}

// The blue line where a dragged component will land as a row of its own.
function DropLine({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="relative h-0">
      <div className="absolute inset-x-0 -top-0.5 h-1 rounded bg-blue-500" />
    </div>
  );
}

// Below the last row: drop here to add at the end.
function EndZone({ empty, showLine }: { empty: boolean; showLine: boolean }) {
  const { setNodeRef } = useDroppable({ id: "end" });
  return (
    <div ref={setNodeRef} className={`relative ${empty ? "pt-0" : "pt-4"}`}>
      <DropLine show={showLine} />
      <div
        className={`flex items-center justify-center rounded-md border-2 border-dashed border-neutral-200 text-sm text-neutral-400 ${
          empty ? "h-60" : "h-20"
        }`}
      >
        {empty ? "Drag components here from the left" : "Drop here to add at the end"}
      </div>
    </div>
  );
}
