"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import {
  BLOCK_SPACING_LIMITS,
  PAGE_MARGIN_LIMITS,
  blockWidthLabel,
  cleanPageMargins,
  snapBlockWidth,
  snapSpacing,
  type HorizontalAlign,
  type PageMargin,
  type PageMargins,
  type VerticalAlign,
} from "@/lib/rowLayout";
import { rowBlockClass, rowBlockStyle, type PreviewDevice } from "@/components/pageRows";

// The pieces of the visual editor (VisualLayoutEditor, 2026-10-07) —
// the frame also shared with the Pages page's Arrange for a Block Build
// page (PageSectionsArranger). The layout is drawn at its desktop width
// (1280px for a page, 600px for a mail) or a phone's (390px), shrunk to
// fit the panel; its margins, gaps and components' edges are dragged by
// hand, and a selected component has a bar for alignment and its other
// actions.

export const PAGE_DESKTOP_WIDTH = 1280;
const PHONE_WIDTH = 390;

// How much the page is shrunk to fit — pointer movements on screen are
// divided by it to get page pixels, and the editor's own controls are
// grown by it so they stay a readable size.
const ScaleContext = createContext(1);

// The page's drawn width, in page pixels — what a component's width (a %
// of the contents inside the margin) is measured against when its edge
// is dragged.
const FrameWidthContext = createContext(PAGE_DESKTOP_WIDTH);

// The Desktop / Phone switch above the page (its hint text dropped
// 2026-10-09 to keep the screen clean, Craig's choice).
export function DeviceSwitch({
  device,
  onDevice,
}: {
  device: PreviewDevice;
  onDevice: (device: PreviewDevice) => void;
}) {
  return (
    <div className="flex rounded-md border border-neutral-300 p-0.5">
      {(["desktop", "phone"] as const).map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onDevice(d)}
          className={`rounded px-3 py-1 text-sm ${
            device === d ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"
          }`}
        >
          {d === "desktop" ? "Desktop" : "Phone"}
        </button>
      ))}
    </div>
  );
}

// Draws the layout at its real width — `desktopWidth` on desktop —
// shrunk to fit the space available, in a scrolling area with room
// above for the first component's bar. `surroundColor` fills the space
// around it (a mail's surround). With `fluid` (a campaign mail, whose
// components hold boxes to type into), it isn't shrunk: when there's
// less room than its real width it's drawn narrower instead, so the
// boxes stay full size; the Preview shows it at its real width.
export function ScaledFrame({
  device,
  desktopWidth,
  surroundColor = null,
  fluid = false,
  children,
}: {
  device: PreviewDevice;
  desktopWidth: number;
  surroundColor?: string | null;
  fluid?: boolean;
  children: ReactNode;
}) {
  const fullWidth = device === "desktop" ? desktopWidth : PHONE_WIDTH;
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [width, setWidth] = useState(fullWidth);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => {
      const room = outer.clientWidth;
      if (fluid) {
        setScale(1);
        setWidth(Math.min(fullWidth, room));
      } else {
        setScale(Math.min(1, room / fullWidth));
        setWidth(fullWidth);
      }
      setHeight(inner.offsetHeight);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    measure();
    return () => observer.disconnect();
  }, [fullWidth, fluid]);

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto pt-12"
      style={{ backgroundColor: surroundColor ?? undefined }}
    >
      {/* inline-size containment: the page's own width never stretches
          the panel it sits in, so it's always measured and shrunk to it. */}
      <div ref={outerRef} className="w-full" style={{ contain: "inline-size" }}>
        <div
          className="mx-auto"
          style={{ width: width * scale, height: height * scale, overflowX: "clip" }}
        >
          <div
            ref={innerRef}
            style={{ width, transform: `scale(${scale})`, transformOrigin: "0 0" }}
          >
            <ScaleContext.Provider value={scale}>
              <FrameWidthContext.Provider value={width}>{children}</FrameWidthContext.Provider>
            </ScaleContext.Provider>
          </div>
        </div>
      </div>
    </div>
  );
}

// The page itself: its background, its margin and its contents. With
// `onMargins` (the editors), the margin is shaded and draggable on all
// four sides, for the device shown; without it (Arrange), it's just
// space. Clicking an empty part of it lets go of the selected component.
export function PageFrame({
  margins,
  device,
  backgroundColor,
  backgroundImage = false,
  onMargins,
  onDeselect,
  children,
}: {
  margins: PageMargins;
  device: PreviewDevice;
  backgroundColor: string | null;
  backgroundImage?: boolean;
  onMargins?: (margins: PageMargins) => void;
  onDeselect?: () => void;
  children: ReactNode;
}) {
  const margin = margins[device];
  const setMargin = (patch: Partial<PageMargin>) =>
    onMargins?.(cleanPageMargins({ ...margins, [device]: { ...margin, ...patch } }));
  return (
    <div
      onClick={onDeselect}
      className={`relative min-h-[640px] bg-white ${
        backgroundImage ? "outline-dashed outline-2 -outline-offset-2 outline-neutral-300" : ""
      }`}
      style={{
        padding: `${margin.vertical}px ${margin.horizontal}px`,
        backgroundColor: backgroundColor ?? undefined,
      }}
    >
      {onMargins && (
        <>
          <MarginHandle side="top" margin={margin} onChange={setMargin} />
          <MarginHandle side="bottom" margin={margin} onChange={setMargin} />
          <MarginHandle side="left" margin={margin} onChange={setMargin} />
          <MarginHandle side="right" margin={margin} onChange={setMargin} />
        </>
      )}
      {children}
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

// A component on the page, as a selectable box at its width. Selected:
// a blue outline, grips on its free edges to drag its width (desktop
// only; snaps to ¼ ⅓ ½ ⅔ ¾ or full, with a label while dragging), its
// bar above it and, when one is open, its panel over it. `boxRef` and
// `boxProps` go on the box itself — the Block Build editor makes it
// draggable with them; the grips, bar and panel sit beside it.
// `horizontalMargin` is the page's desktop side margin.
export function EditableBlock({
  width,
  device,
  horizontal,
  horizontalMargin,
  label,
  selected,
  faded = false,
  onSelect,
  onWidth,
  bar,
  panel,
  overlay,
  boxRef,
  boxProps,
  children,
}: {
  width: number;
  device: PreviewDevice;
  horizontal: HorizontalAlign;
  horizontalMargin: number;
  label: string;
  selected: boolean;
  faded?: boolean;
  onSelect: () => void;
  onWidth: (width: number) => void;
  bar: ReactNode;
  panel: ReactNode;
  overlay?: ReactNode;
  boxRef?: Ref<HTMLDivElement>;
  boxProps?: HTMLAttributes<HTMLDivElement>;
  children: ReactNode;
}) {
  const scale = useContext(ScaleContext);
  const contentWidth = useContext(FrameWidthContext) - 2 * horizontalMargin;
  const [resizing, setResizing] = useState(false);
  const desktop = device === "desktop";

  // The new width from how far the edge has moved, snapped to the
  // nearest fraction. A centred row grows on both sides, so the edge
  // only has to move half as far.
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

  return (
    <div className={`relative ${rowBlockClass(device)}`} style={rowBlockStyle(width)}>
      <div
        ref={boxRef}
        {...boxProps}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        className={`rounded-md ${boxProps ? "cursor-grab" : "cursor-pointer"} ${
          selected ? "ring-2 ring-blue-500" : "hover:ring-1 hover:ring-blue-300"
        } ${faded ? "opacity-40" : ""}`}
      >
        {children}
      </div>

      {overlay}

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
          {bar}
        </Unscaled>
      )}
      {selected && panel && (
        <Unscaled className="absolute left-0 top-0 z-30" origin="0 0">
          {panel}
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

// A selected component's bar: its row's alignment (desktop only) —
// left, centre or right, and with `vertical` (components side by side)
// top, middle or bottom — then the editor's own buttons.
export function SelectionBar({
  desktop,
  horizontal,
  vertical,
  onAlign,
  children,
}: {
  desktop: boolean;
  horizontal: HorizontalAlign;
  vertical?: VerticalAlign;
  onAlign: (patch: { horizontal?: HorizontalAlign; vertical?: VerticalAlign }) => void;
  children: ReactNode;
}) {
  const iconButton = (active: boolean) =>
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
            className={iconButton(horizontal === b.value)}
          >
            <AlignIcon kind={b.value} />
          </button>
        ))}
      {desktop && vertical && <BarDivider />}
      {desktop &&
        vertical &&
        VERTICAL_BUTTONS.map((b) => (
          <button
            key={b.value}
            type="button"
            title={b.label}
            aria-label={b.label}
            onClick={() => onAlign({ vertical: b.value })}
            className={iconButton(vertical === b.value)}
          >
            <AlignIcon kind={b.value} />
          </button>
        ))}
      {desktop && <BarDivider />}
      {children}
    </div>
  );
}

export function BarDivider() {
  return <span className="mx-0.5 h-5 w-px bg-neutral-200" />;
}

export function BarButton({
  active = false,
  danger = false,
  onClick,
  children,
}: {
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const colour = danger
    ? "text-red-600 hover:bg-red-50"
    : active
      ? "bg-blue-100 text-blue-700"
      : "text-neutral-700 hover:bg-neutral-100";
  return (
    <button type="button" onClick={onClick} className={`rounded px-2 py-1 text-xs ${colour}`}>
      {children}
    </button>
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

// The panel a selected component's bar opens over it.
export function PanelBox({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="flex w-72 cursor-default flex-col gap-2 rounded-md border border-neutral-300 bg-white p-3 shadow-md"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{title}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-neutral-400 hover:text-neutral-900"
        >
          ✕
        </button>
      </div>
      {children}
    </div>
  );
}

// A shaded, draggable gap: between rows (vertical), or between
// side-by-side components (horizontal). Grabbable even when it's 0.
export function SpacingHandle({
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
  const scale = useContext(ScaleContext);
  const vertical = side === "top" || side === "bottom";
  const value = vertical ? margin.vertical : margin.horizontal;
  // Dragging away from the page's middle makes the margin bigger.
  const sign = side === "top" || side === "left" ? 1 : -1;
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

// Escape lets go of the selected component; with `onDelete`, Delete or
// Backspace removes it — never while typing in a box.
export function useSelectionKeys(selected: boolean, onDeselect: () => void, onDelete?: () => void) {
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable]")) return;
      if (onDelete && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        onDelete();
      } else if (e.key === "Escape") {
        onDeselect();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, onDeselect, onDelete]);
}
