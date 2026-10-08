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
import {
  BLOCK_SPACING_LIMITS,
  BLOCK_WIDTH_LIMITS,
  blockWidthOf,
  groupBlocksByRow,
  placeLayoutBlock,
  removeLayoutBlock,
  replaceBlock,
  rowKey,
  rowSettingsOf,
  updateBlockWidth,
  updateRowSettings,
  type BlockDropTarget,
  type RowBlock,
  type RowLayout,
  type RowSettings,
} from "@/lib/rowLayout";
import { rowClass, type PreviewDevice } from "@/components/pageRows";
import { Labelled } from "@/components/blockShapes";
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
  useSelectionKeys,
} from "@/components/visualEditorParts";

// The visual editor for a row-based layout (2026-10-07, from Craig's
// request to replace the numbers with something he can see; shared by
// Page Styles and Mail Templates from 2026-10-08) — built from the
// pieces in visualEditorParts. What the components are, how each is
// drawn and any settings of its own come from the caller
// (PageStyleLayoutEditor, MailLayoutEditor).
// - Add: drag a component from the tray onto the layout (or click it to
//   add it at the end). A blue line shows where it will land: above or
//   below a row, or beside a component (desktop only).
// - Move: drag a component the same way.
// - Remove: drag a component back onto the tray, which turns red while
//   it's over it — or select it and use its bar's Remove (or Delete).
// - Size: select a component and drag its edge (desktop only — on a
//   phone every component is full width).
// - Spacing: drag the shaded strips — the gaps between rows, between
//   side-by-side components, and the margin (set separately for desktop
//   and phone).
// - Align: a selected component's bar sets its row's alignment — left,
//   centre or right, and for side-by-side components top, middle or
//   bottom (desktop only).
// - Fine-tune: the bar's Fine-tune button shows the exact numbers for
//   the component's width and the gaps around its row; a component with
//   settings of its own (e.g. Sliding doors) has a button for those.
// - What's inside each component is the caller's: an outline (Page
//   Styles, Mail Templates) or boxes to type its content into (a
//   campaign mail, drawn `fluid` so they stay full size). Pressing in
//   those boxes never starts a drag — the caller stops it — so a
//   component is moved by its label strip.
// `footer` is a fixed part drawn below the components (a mail's
// footer). Every change goes straight to `onChange`, which saves it.

// A component offered in the tray.
export type EditorComponent<T extends string> = { value: T; label: string };

// A component's own settings, opened from its bar: the button's label,
// the panel's title and its contents.
export type BlockSettingsPanel = { button: string; title: string; content: ReactNode };

type DragItem<B extends RowBlock> =
  | { kind: "new"; type: B["type"] }
  | { kind: "move"; block: B };

// What a component's drop zone knows about where it is.
type DropData = { blockId: string; rowIndex: number };

// The tray's drop zone id: a component dropped here is removed.
const TRAY_ID = "tray";

export default function VisualLayoutEditor<B extends RowBlock, L extends RowLayout<B>>({
  layout,
  onChange,
  components,
  newBlock,
  renderBlock,
  settingsPanel,
  desktopWidth,
  backgroundColor,
  backgroundImage = false,
  surroundColor = null,
  fluid = false,
  footer,
}: {
  layout: L;
  onChange: (layout: L) => void;
  components: readonly EditorComponent<B["type"]>[];
  newBlock: (type: B["type"]) => B;
  // How a component is drawn: its outline, or its content to type into.
  renderBlock: (block: B) => ReactNode;
  // A component's own settings, if it has any; `onBlock` saves them.
  settingsPanel?: (block: B, onBlock: (block: B) => void) => BlockSettingsPanel | null;
  desktopWidth: number;
  backgroundColor: string | null;
  backgroundImage?: boolean;
  surroundColor?: string | null;
  fluid?: boolean;
  footer?: ReactNode;
}) {
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DragItem<B> | null>(null);
  const [dropTarget, setDropTarget] = useState<BlockDropTarget | null>(null);
  // A component being moved is over the tray, so dropping removes it.
  const [overTray, setOverTray] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const rows = groupBlocksByRow(layout.blocks);
  const labelOf = (type: B["type"]) => components.find((c) => c.value === type)?.label ?? type;

  const remove = useCallback(
    (blockId: string) => {
      onChange(removeLayoutBlock<B, L>(layout, blockId));
      setSelectedId((current) => (current === blockId ? null : current));
    },
    [layout, onChange]
  );

  const deselect = useCallback(() => setSelectedId(null), []);
  const removeSelected = useCallback(() => {
    if (selectedId) remove(selectedId);
  }, [remove, selectedId]);
  useSelectionKeys(!!selectedId, deselect, removeSelected);

  const place = (block: B, target: BlockDropTarget) => {
    const next = placeLayoutBlock<B, L>(layout, block, target);
    if (next !== layout) onChange(next);
  };

  const handleDragStart = (e: DragStartEvent) => {
    setDragging((e.active.data.current as DragItem<B> | undefined) ?? null);
    setDropTarget(null);
    setOverTray(false);
  };

  // Works out the landing place from the pointer's position over a
  // component: its top or bottom quarter = a row of its own above or
  // below that row; otherwise beside it, on the side the pointer is on.
  // On a phone components stack, so it's always above or below. Over
  // the tray, a component being moved is marked for removal instead.
  const handleDragMove = (e: DragMoveEvent) => {
    const item = e.active.data.current as DragItem<B> | undefined;
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
        const block = newBlock(dragging.type);
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

  const addAtEnd = (type: B["type"]) => {
    const block = newBlock(type);
    place(block, { kind: "row", index: rows.length });
    setSelectedId(block.id);
  };

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
        <Tray components={components} moving={!!draggingId} over={overTray} onAdd={addAtEnd} />

        <div className="flex min-w-0 flex-1 flex-col">
          <DeviceSwitch device={device} onDevice={setDevice} />
          <ScaledFrame
            device={device}
            desktopWidth={desktopWidth}
            surroundColor={surroundColor}
            fluid={fluid}
          >
            <PageFrame
              margins={layout.margins}
              device={device}
              backgroundColor={backgroundColor}
              backgroundImage={backgroundImage}
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
                            label={labelOf(b.type)}
                            rowIndex={i}
                            rowSize={row.length}
                            lastRow={i === rows.length - 1}
                            device={device}
                            settings={settings}
                            horizontalMargin={layout.margins.desktop.horizontal}
                            selected={b.id === selectedId}
                            faded={b.id === draggingId}
                            dropSide={
                              dropTarget?.kind === "beside" && dropTarget.blockId === b.id
                                ? dropTarget.side
                                : null
                            }
                            ownSettings={settingsPanel?.(b, (next) =>
                              onChange({ ...layout, blocks: replaceBlock(layout.blocks, next) })
                            )}
                            onSelect={() => setSelectedId(b.id)}
                            onWidth={(width) =>
                              onChange({
                                ...layout,
                                blocks: updateBlockWidth(layout.blocks, b.id, width),
                              })
                            }
                            onRow={setRow}
                            onRemove={() => remove(b.id)}
                          >
                            {renderBlock(b)}
                          </BlockItem>
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
              {footer}
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
            {labelOf(dragging.kind === "new" ? dragging.type : dragging.block.type)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// Whether dropping a component at `target` would leave the layout as it
// is: a component alone in its row dropped just above or below itself.
function changesNothing(rows: RowBlock[][], blockId: string, target: BlockDropTarget): boolean {
  if (target.kind === "beside") return target.blockId === blockId;
  const index = rows.findIndex((r) => r.some((b) => b.id === blockId));
  return rows[index]?.length === 1 && (target.index === index || target.index === index + 1);
}

// The Components tray: components to drag onto the layout, and — while
// a component on it is being dragged — the place to drop it to remove it
// (outlined in red, filled red when it's over it).
function Tray<T extends string>({
  components,
  moving,
  over,
  onAdd,
}: {
  components: readonly EditorComponent<T>[];
  moving: boolean;
  over: boolean;
  onAdd: (type: T) => void;
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
      {components.map((c) => (
        <TrayItem key={c.value} type={c.value} label={c.label} onAdd={onAdd} />
      ))}
      <p className={`mt-1 text-xs ${moving ? "text-red-600" : "text-neutral-400"}`}>
        {moving
          ? "Drop here to remove."
          : "Drag onto the layout, or click to add at the end. Drag back here to remove."}
      </p>
    </aside>
  );
}

function TrayItem<T extends string>({
  type,
  label,
  onAdd,
}: {
  type: T;
  label: string;
  onAdd: (type: T) => void;
}) {
  const item = { kind: "new", type };
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

// The panel a selected component's bar opens: its exact numbers, or its
// own settings.
type Panel = "fine" | "own";

function BlockItem<B extends RowBlock>({
  block,
  label,
  rowIndex,
  rowSize,
  lastRow,
  device,
  settings,
  horizontalMargin,
  selected,
  faded,
  dropSide,
  ownSettings,
  onSelect,
  onWidth,
  onRow,
  onRemove,
  children,
}: {
  block: B;
  label: string;
  rowIndex: number;
  rowSize: number;
  lastRow: boolean;
  device: PreviewDevice;
  settings: RowSettings;
  horizontalMargin: number;
  selected: boolean;
  faded: boolean;
  dropSide: "left" | "right" | null;
  ownSettings: BlockSettingsPanel | null | undefined;
  onSelect: () => void;
  onWidth: (width: number) => void;
  onRow: (patch: Partial<RowSettings>) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const item: DragItem<B> = { kind: "move", block };
  const drop: DropData = { blockId: block.id, rowIndex };
  const drag = useDraggable({ id: `block:${block.id}`, data: item });
  const zone = useDroppable({ id: `drop:${block.id}`, data: drop });
  const [panel, setPanel] = useState<Panel | null>(null);
  const togglePanel = (p: Panel) => setPanel((current) => (current === p ? null : p));
  const width = blockWidthOf(block);

  return (
    <EditableBlock
      width={width}
      device={device}
      horizontal={settings.horizontal}
      horizontalMargin={horizontalMargin}
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
          {ownSettings && (
            <BarButton active={panel === "own"} onClick={() => togglePanel("own")}>
              {ownSettings.button}
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
        panel === "fine" ? (
          <PanelBox title="Fine-tune" onClose={() => setPanel(null)}>
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
            <p className="text-xs text-neutral-400">On a phone every component is full width.</p>
          </PanelBox>
        ) : panel === "own" && ownSettings ? (
          <PanelBox title={ownSettings.title} onClose={() => setPanel(null)}>
            {ownSettings.content}
          </PanelBox>
        ) : null
      }
    >
      <Labelled label={label}>{children}</Labelled>
    </EditableBlock>
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
