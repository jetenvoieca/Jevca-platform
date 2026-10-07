"use client";

import { useCallback, useState, type ReactNode } from "react";
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
  BLOCK_WIDTH_LIMITS,
  LAYOUT_BLOCK_TYPES,
  SLIDING_DOORS_LIMITS,
  blockTypeLabel,
  blockWidthOf,
  newLayoutBlock,
  placeLayoutBlock,
  removeLayoutBlock,
  rowKey,
  rowSettingsOf,
  updateBlockWidth,
  updateRowSettings,
  updateSlidingDoors,
  type BlockDropTarget,
  type CustomLayout,
  type LayoutBlock,
  type LayoutBlockType,
  type RowSettings,
  type SlidingDoorsSettings,
} from "@/lib/pageStyleLayout";
import { rowClass, type PreviewDevice } from "@/components/pageRows";
import { BlockShape, Labelled } from "@/components/PageStylePreview";
import NumberField from "@/components/NumberField";
import {
  BarButton,
  BarDivider,
  DeviceSwitch,
  EditableBlock,
  PageFrame,
  PanelBox,
  ScaledFrame,
  SelectionBar,
  SpacingHandle,
  desktopContentWidth,
  useSelectionKeys,
} from "@/components/visualEditorParts";

// The visual editor for a Private / Custom Page Style (2026-10-07, from
// Craig's request to replace the numbers with something he can see) —
// built from the pieces in visualEditorParts, shared with the Section
// editor.
// - Add: drag a component from the tray onto the page (or click it to
//   add it at the end). A blue line shows where it will land: above or
//   below a row, or beside a component (desktop only).
// - Move: drag a component the same way.
// - Remove: drag a component back onto the tray, which turns red while
//   it's over it — or select it and use its bar's Remove (or Delete).
// - Size: select a component and drag its edge (desktop only — on a
//   phone every component is full width).
// - Spacing: drag the shaded strips — the gaps between rows, between
//   side-by-side components, and the page margin (set separately for
//   desktop and phone).
// - Align: a selected component's bar sets its row's alignment — left,
//   centre or right, and for side-by-side components top, middle or
//   bottom (desktop only).
// - Fine-tune: the bar's Fine-tune button shows the exact numbers for
//   the component's width and the gaps around its row; a Sliding doors
//   component's Settings button shows its own settings (pairs or one at
//   a time, timings, gap and height).
// Every change goes straight to `onChange`, which saves it.

type DragItem = { kind: "new"; type: LayoutBlockType } | { kind: "move"; block: LayoutBlock };

// What a component's drop zone knows about where it is.
type DropData = { blockId: string; rowIndex: number };

// The tray's drop zone id: a component dropped here is removed.
const TRAY_ID = "tray";

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
  // A component being moved is over the tray, so dropping removes it.
  const [overTray, setOverTray] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const rows = groupBlocksByRow(layout.blocks);

  const remove = useCallback(
    (blockId: string) => {
      onChange(removeLayoutBlock(layout, blockId));
      setSelectedId((current) => (current === blockId ? null : current));
    },
    [layout, onChange]
  );

  const deselect = useCallback(() => setSelectedId(null), []);
  const removeSelected = useCallback(() => {
    if (selectedId) remove(selectedId);
  }, [remove, selectedId]);
  useSelectionKeys(!!selectedId, deselect, removeSelected);

  const place = (block: LayoutBlock, target: BlockDropTarget) => {
    const next = placeLayoutBlock(layout, block, target);
    if (next !== layout) onChange(next);
  };

  const handleDragStart = (e: DragStartEvent) => {
    setDragging((e.active.data.current as DragItem | undefined) ?? null);
    setDropTarget(null);
    setOverTray(false);
  };

  // Works out the landing place from the pointer's position over a
  // component: its top or bottom quarter = a row of its own above or
  // below that row; otherwise beside it, on the side the pointer is on.
  // On a phone components stack, so it's always above or below. Over
  // the tray, a component being moved is marked for removal instead.
  const handleDragMove = (e: DragMoveEvent) => {
    const item = e.active.data.current as DragItem | undefined;
    const start = e.activatorEvent as PointerEvent;
    const over = e.over;
    const onTray = item?.kind === "move" && over?.id === TRAY_ID;
    let target: BlockDropTarget | null = null;
    if (item && over && over.id !== TRAY_ID) {
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
    setOverTray(onTray);
    setDropTarget((current) =>
      JSON.stringify(current) === JSON.stringify(target) ? current : target
    );
  };

  const handleDragEnd = () => {
    if (dragging?.kind === "move" && overTray) {
      remove(dragging.block.id);
    } else if (dragging && dropTarget) {
      if (dragging.kind === "new") {
        const block = newLayoutBlock(dragging.type);
        place(block, dropTarget);
        setSelectedId(block.id);
      } else {
        place(dragging.block, dropTarget);
      }
    }
    handleDragCancel();
  };

  const handleDragCancel = () => {
    setDragging(null);
    setDropTarget(null);
    setOverTray(false);
  };

  const addAtEnd = (type: LayoutBlockType) => {
    const block = newLayoutBlock(type);
    place(block, { kind: "row", index: rows.length });
    setSelectedId(block.id);
  };

  const contentWidth = desktopContentWidth(layout.margins);
  const draggingId = dragging?.kind === "move" ? dragging.block.id : null;

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
        <Tray moving={!!draggingId} over={overTray} onAdd={addAtEnd} />

        <div className="flex min-w-0 flex-1 flex-col">
          <DeviceSwitch device={device} onDevice={setDevice} />
          <ScaledFrame device={device}>
            <PageFrame
              margins={layout.margins}
              device={device}
              backgroundColor={layout.backgroundColor}
              backgroundImage={layout.backgroundImage}
              onMargins={(margins) => onChange({ ...layout, margins })}
              onDeselect={deselect}
            >
              {rows.map((row, i) => {
                const key = rowKey(row);
                const settings = rowSettingsOf(layout, key);
                const setRow = (patch: Partial<RowSettings>) =>
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
                            lastRow={i === rows.length - 1}
                            device={device}
                            settings={settings}
                            contentWidth={contentWidth}
                            selected={b.id === selectedId}
                            faded={b.id === draggingId}
                            dropSide={
                              dropTarget?.kind === "beside" && dropTarget.blockId === b.id
                                ? dropTarget.side
                                : null
                            }
                            gridSpacing={layout.gridSpacing}
                            onSelect={() => setSelectedId(b.id)}
                            onWidth={(width) =>
                              onChange({
                                ...layout,
                                blocks: updateBlockWidth(layout.blocks, b.id, width),
                              })
                            }
                            onRow={setRow}
                            onDoors={(doors) =>
                              onChange({
                                ...layout,
                                blocks: updateSlidingDoors(layout.blocks, b.id, doors),
                              })
                            }
                            onRemove={() => remove(b.id)}
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
            </PageFrame>
          </ScaledFrame>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div
            className={`rounded-md border bg-white px-3 py-2 text-sm shadow-md ${
              overTray ? "border-red-500 text-red-700" : "border-blue-500 text-neutral-800"
            }`}
          >
            {overTray ? "Remove " : ""}
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

// The Components tray: components to drag onto the page, and — while a
// component on the page is being dragged — the place to drop it to
// remove it (outlined in red, filled red when it's over it).
function Tray({
  moving,
  over,
  onAdd,
}: {
  moving: boolean;
  over: boolean;
  onAdd: (type: LayoutBlockType) => void;
}) {
  const { setNodeRef } = useDroppable({ id: TRAY_ID });
  const outline = !moving
    ? "border-transparent"
    : over
      ? "border-red-500 bg-red-50"
      : "border-dashed border-red-300";
  return (
    <aside
      ref={setNodeRef}
      className={`flex w-40 shrink-0 flex-col gap-1.5 rounded-lg border-2 p-1.5 ${outline}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Components</p>
      {LAYOUT_BLOCK_TYPES.map((t) => (
        <TrayItem key={t.value} type={t.value} label={t.label} onAdd={onAdd} />
      ))}
      <p className={`mt-1 text-xs ${moving ? "text-red-600" : "text-neutral-400"}`}>
        {moving
          ? "Drop here to remove."
          : "Drag onto the page, or click to add at the end. Drag back here to remove."}
      </p>
    </aside>
  );
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

// The panel a selected component's bar opens: its exact numbers, or a
// Sliding doors component's own settings.
type Panel = "fine" | "doors";

function BlockItem({
  block,
  rowIndex,
  rowSize,
  lastRow,
  device,
  settings,
  contentWidth,
  selected,
  faded,
  dropSide,
  gridSpacing,
  onSelect,
  onWidth,
  onRow,
  onDoors,
  onRemove,
}: {
  block: LayoutBlock;
  rowIndex: number;
  rowSize: number;
  lastRow: boolean;
  device: PreviewDevice;
  settings: RowSettings;
  contentWidth: number;
  selected: boolean;
  faded: boolean;
  dropSide: "left" | "right" | null;
  gridSpacing: CustomLayout["gridSpacing"];
  onSelect: () => void;
  onWidth: (width: number) => void;
  onRow: (patch: Partial<RowSettings>) => void;
  onDoors: (doors: SlidingDoorsSettings) => void;
  onRemove: () => void;
}) {
  const item: DragItem = { kind: "move", block };
  const drop: DropData = { blockId: block.id, rowIndex };
  const drag = useDraggable({ id: `block:${block.id}`, data: item });
  const zone = useDroppable({ id: `drop:${block.id}`, data: drop });
  const [panel, setPanel] = useState<Panel | null>(null);
  const togglePanel = (p: Panel) => setPanel((current) => (current === p ? null : p));
  const width = blockWidthOf(block);
  const label = blockTypeLabel(block.type);

  return (
    <EditableBlock
      width={width}
      device={device}
      horizontal={settings.horizontal}
      contentWidth={contentWidth}
      label={`${label} — drag to move, click to select`}
      selected={selected}
      faded={faded}
      onSelect={onSelect}
      onWidth={onWidth}
      boxRef={(el) => {
        drag.setNodeRef(el);
        zone.setNodeRef(el);
      }}
      boxProps={{ ...drag.attributes, ...drag.listeners }}
      overlay={
        dropSide && (
          <div
            className={`absolute inset-y-0 w-1 rounded bg-blue-500 ${
              dropSide === "left" ? "-left-1" : "-right-1"
            }`}
          />
        )
      }
      bar={
        <SelectionBar
          desktop={device === "desktop"}
          horizontal={settings.horizontal}
          vertical={rowSize > 1 ? settings.vertical : undefined}
          onAlign={onRow}
        >
          {block.doors && (
            <BarButton active={panel === "doors"} onClick={() => togglePanel("doors")}>
              Settings
            </BarButton>
          )}
          <BarButton active={panel === "fine"} onClick={() => togglePanel("fine")}>
            Fine-tune
          </BarButton>
          <BarDivider />
          <BarButton danger onClick={onRemove}>
            Remove
          </BarButton>
        </SelectionBar>
      }
      panel={
        panel && (
          <PanelBox
            title={panel === "fine" ? "Fine-tune" : "Sliding doors"}
            onClose={() => setPanel(null)}
          >
            {panel === "fine" ? (
              <>
                <NumberField
                  label="Width, desktop"
                  unit="%"
                  step={1}
                  value={width}
                  limits={BLOCK_WIDTH_LIMITS}
                  onCommit={onWidth}
                  wide
                />
                {rowSize > 1 && (
                  <NumberField
                    label="Space between"
                    unit="pixels"
                    step={1}
                    value={settings.between}
                    limits={BLOCK_SPACING_LIMITS}
                    onCommit={(between) => onRow({ between })}
                    wide
                  />
                )}
                {!lastRow && (
                  <NumberField
                    label="Space below"
                    unit="pixels"
                    step={1}
                    value={settings.below}
                    limits={BLOCK_SPACING_LIMITS}
                    onCommit={(below) => onRow({ below })}
                    wide
                  />
                )}
                <p className="text-xs text-neutral-400">
                  On a phone every component is full width.
                </p>
              </>
            ) : (
              block.doors && <DoorsSettings doors={block.doors} onChange={onDoors} />
            )}
          </PanelBox>
        )
      }
    >
      <Labelled label={label}>
        <BlockShape block={block} spacing={gridSpacing} />
      </Labelled>
    </EditableBlock>
  );
}

// The Sliding doors number settings, in order. Gap only applies to pairs.
const DOORS_FIELDS: {
  key: Exclude<keyof SlidingDoorsSettings, "perSlide" | "height">;
  label: string;
  unit: string;
  step: number;
}[] = [
  { key: "duration", label: "Duration", unit: "seconds", step: 0.5 },
  { key: "speed", label: "Slide speed", unit: "seconds", step: 0.5 },
  { key: "gap", label: "Gap", unit: "pixels", step: 1 },
];

// A Sliding doors component's settings (2026-10-05; on the component
// itself from 2026-10-07): pairs or one at a time, how long each slide
// shows, how fast it moves, the gap between a pair, and the square
// panels' height on desktop and phone.
function DoorsSettings({
  doors,
  onChange,
}: {
  doors: SlidingDoorsSettings;
  onChange: (doors: SlidingDoorsSettings) => void;
}) {
  return (
    <>
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <span className="flex-1">Show</span>
        <select
          value={doors.perSlide}
          onChange={(e) => onChange({ ...doors, perSlide: e.target.value === "1" ? 1 : 2 })}
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value={2}>Pairs</option>
          <option value={1}>One at a time</option>
        </select>
      </label>
      {DOORS_FIELDS.filter((f) => f.key !== "gap" || doors.perSlide === 2).map((f) => (
        <NumberField
          key={f.key}
          label={f.label}
          unit={f.unit}
          step={f.step}
          value={doors[f.key]}
          limits={SLIDING_DOORS_LIMITS[f.key]}
          onCommit={(value) => onChange({ ...doors, [f.key]: value })}
          wide
        />
      ))}
      <NumberField
        label="Height, desktop"
        unit="% of screen"
        step={5}
        value={doors.height.desktop}
        limits={SLIDING_DOORS_LIMITS.height}
        onCommit={(desktop) => onChange({ ...doors, height: { ...doors.height, desktop } })}
        wide
      />
      <NumberField
        label="Height, phone"
        unit="% of screen"
        step={5}
        value={doors.height.phone}
        limits={SLIDING_DOORS_LIMITS.height}
        onCommit={(phone) => onChange({ ...doors, height: { ...doors.height, phone } })}
        wide
      />
    </>
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
