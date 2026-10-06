"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import type { CurationCover, CurationWork } from "@/lib/actions/curations";
import type { CanvasPlacement } from "@/lib/actions/pageCanvas";
import type { CanvasLayout } from "@/lib/pageStyleLayout";
import { useSiteData } from "@/lib/siteData";
import CurationPanel from "@/components/CurationPanel";

// A Canvas page played (2026-10-05, from Craig's mockups): the page's
// placed curations on a large canvas that scrolls in any direction —
// mouse wheel, trackpad, scrollbars, or dragging the background. Wheel,
// trackpad and drag movement are scaled by the style's Scroll speed.
// Each curation shows as its cover (first work's main image, name over
// it). The one whose centre is within one tile of the middle of the view
// opens over the style's opening speed: its first work at the style's
// Opened size (times the tile size), the next five around it as a tight
// 3 × 3 grid — the first work fills a 2 × 2 corner, two sit below it and
// three down its right-hand side — so each smaller image is half the
// first's width less the gap. Every other curation moves aside to make
// room. Clicking an opened image opens the curation panel at that work
// (2026-10-06, see CurationPanel); clicking a closed curation scrolls it
// to the middle. The canvas is bounded: it is as big as the placements,
// plus half a view of margin all round so every curation can reach the
// middle. Content comes from the page's site data (lib/siteData.tsx).
//
// The view's height: `fullScreen` fills the whole browser window (the
// site's own pages); otherwise a fixed-height window (the admin
// preview). Either way it's fixed (fix, 2026-10-05): the canvas's size
// depends on the view's size, so the view must never grow to fit the
// canvas, or the two keep enlarging each other. Nothing animates until
// the view has been measured and centred, so tiles don't slide in from
// where they sat before.
//
// Light on the device (2026-10-06): every image keeps a fixed size and
// is moved and resized only with a CSS transform (translate + scale) and
// faded with opacity, which the graphics processor handles without the
// page being laid out again each frame. A cover is drawn at its opened
// size and scaled down when closed, so it stays sharp (its name scales
// with it). Covers load only as they come near the view, and "which
// curation is nearest the middle" is worked out at most once per screen
// refresh while scrolling.

const GAP = 8;
// Works shown when a curation opens.
const OPEN_COUNT = 6;
// A wheel "line" in pixels, for mice that scroll by lines.
const LINE_HEIGHT = 16;
// A closed cover's name, in pixels.
const NAME_FONT_SIZE = 14;

type Rect = { left: number; top: number; size: number };

export default function CanvasPlayer({
  pageId,
  layout,
  fullScreen = false,
}: {
  pageId: string;
  layout: CanvasLayout;
  fullScreen?: boolean;
}) {
  const siteData = useSiteData();
  const T = layout.tileSize;
  const [placements, setPlacements] = useState<CanvasPlacement[] | null>(null);
  const [covers, setCovers] = useState<Map<string, CurationCover>>(new Map());
  const [works, setWorks] = useState<Map<string, CurationWork[]>>(new Map());
  const [view, setView] = useState<{ w: number; h: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ curationId: string; artworkId: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const loadingRef = useRef(new Set<string>());
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    let current = true;
    Promise.all([siteData.getCanvas(pageId), siteData.listCovers()]).then(
      ([loadedPlacements, loadedCovers]) => {
        if (!current) return;
        setCovers(new Map(loadedCovers.map((c) => [c.id, c])));
        setPlacements(loadedPlacements);
      }
    );
    return () => {
      current = false;
    };
  }, [siteData, pageId]);

  // The view's size, kept up to date as it changes.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setView({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [placements]);

  // Wheel and trackpad scrolling, slowed (or sped up) by Scroll speed.
  // Whole pixels are scrolled and the remainder carried over, so slow
  // speeds still move smoothly. Pinch-zoom (ctrl + wheel) is left alone.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let carryX = 0;
    let carryY = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? LINE_HEIGHT : 1;
      carryX += e.deltaX * unit * layout.scrollSpeed;
      carryY += e.deltaY * unit * layout.scrollSpeed;
      const dx = Math.trunc(carryX);
      const dy = Math.trunc(carryY);
      carryX -= dx;
      carryY -= dy;
      if (dx || dy) el.scrollBy(dx, dy);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [placements, layout.scrollSpeed]);

  // Cancels a pending check when leaving the page.
  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  const marginX = view ? Math.round(view.w / 2) : 0;
  const marginY = view ? Math.round(view.h / 2) : 0;

  // Which curation is open: the nearest one whose centre is within one
  // tile of the middle of the view, judged on where tiles sit when
  // closed, so moving aside never changes the answer.
  const updateOpen = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !placements) return;
    const cx = el.scrollLeft + el.clientWidth / 2 - marginX;
    const cy = el.scrollTop + el.clientHeight / 2 - marginY;
    let best: string | null = null;
    let bestDistance = T;
    for (const p of placements) {
      const d = Math.hypot(p.x + T / 2 - cx, p.y + T / 2 - cy);
      if (d <= bestDistance) {
        best = p.curationId;
        bestDistance = d;
      }
    }
    setOpenId(best);
  }, [placements, marginX, marginY, T]);

  // Scroll events can arrive many times per frame; check at most once
  // per screen refresh.
  const onScroll = () => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      updateOpen();
    });
  };

  // Once the view is measured, starts with the first placed curation in
  // the middle, then lets things animate.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !view || !placements || ready) return;
    const first = placements[0];
    if (first) {
      el.scrollLeft = first.x + T / 2;
      el.scrollTop = first.y + T / 2;
    }
    updateOpen();
    setReady(true);
  }, [view, placements, T, updateOpen, ready]);

  // Loads the opened curation's works the first time it opens.
  useEffect(() => {
    if (!openId || works.has(openId) || loadingRef.current.has(openId)) return;
    loadingRef.current.add(openId);
    siteData.getCuration(openId).then((detail) => {
      setWorks((prev) =>
        new Map(prev).set(
          openId,
          (detail?.works ?? []).filter((w) => w.displayUrl).slice(0, OPEN_COUNT)
        )
      );
    });
  }, [siteData, openId, works]);

  const closePanel = useCallback(() => setViewing(null), []);

  const scrollToCentre = (p: CanvasPlacement) => {
    scrollRef.current?.scrollTo({ left: p.x + T / 2, top: p.y + T / 2, behavior: "smooth" });
  };

  // Dragging the background pans the canvas, scaled by Scroll speed.
  const startPan = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || !scrollRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    panRef.current = {
      x: e.clientX,
      y: e.clientY,
      left: scrollRef.current.scrollLeft,
      top: scrollRef.current.scrollTop,
    };
  };
  const movePan = (e: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const el = scrollRef.current;
    if (!pan || !el) return;
    el.scrollLeft = pan.left - (e.clientX - pan.x) * layout.scrollSpeed;
    el.scrollTop = pan.top - (e.clientY - pan.y) * layout.scrollSpeed;
  };
  const endPan = () => {
    panRef.current = null;
  };

  if (placements === null) {
    return <p className="py-10 text-center text-sm text-neutral-400">Loading…</p>;
  }
  if (placements.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-neutral-400">
        No curations placed on this page yet — use Arrange.
      </p>
    );
  }

  // The opened curation's sizes: the first work, and the smaller images
  // sized so two of them plus a gap exactly match its width. Then how
  // far everything else moves aside.
  const main = Math.round(T * layout.openScale);
  const small = Math.round((main - GAP) / 2);
  const openSize = main + GAP + small;
  const push = (openSize - T) / 2;
  const open = placements.find((p) => p.curationId === openId) ?? null;

  const width = Math.max(...placements.map((p) => p.x)) + T + 2 * marginX;
  const height = Math.max(...placements.map((p) => p.y)) + T + 2 * marginY;

  const s = layout.openSpeed;
  const transition = ready ? `transform ${s}s ease, opacity ${s}s ease` : "none";

  // A closed tile's place, moved aside if another curation is open.
  const closedRect = (p: CanvasPlacement): Rect => {
    let left = p.x + marginX;
    let top = p.y + marginY;
    if (open && open !== p) {
      const dx = p.x - open.x;
      const dy = p.y - open.y;
      if (Math.abs(dx) > T / 4) left += Math.sign(dx) * push;
      if (Math.abs(dy) > T / 4) top += Math.sign(dy) * push;
    }
    return { left, top, size: T };
  };

  // Where an opened curation's images go, centred on its tile, as a
  // 3 × 3 grid: the first in the top-left 2 × 2, then the two below it,
  // then the right-hand column from the bottom corner up.
  const openedRects = (p: CanvasPlacement): Rect[] => {
    const left = p.x + marginX + T / 2 - openSize / 2;
    const top = p.y + marginY + T / 2 - openSize / 2;
    const step = small + GAP;
    const below = top + main + GAP;
    const right = left + main + GAP;
    return [
      { left, top, size: main },
      { left, top: below, size: small },
      { left: left + step, top: below, size: small },
      { left: right, top: below, size: small },
      { left: right, top: top + step, size: small },
      { left: right, top, size: small },
    ];
  };

  // An element of fixed size `base`, placed and sized at `r` by a
  // transform alone.
  const rectStyle = (r: Rect, base: number, extra?: CSSProperties): CSSProperties => ({
    left: 0,
    top: 0,
    width: base,
    height: base,
    transformOrigin: "0 0",
    transform: `translate3d(${r.left}px, ${r.top}px, 0) scale(${r.size / base})`,
    transition,
    ...extra,
  });

  return (
    <div
      className={`relative w-full overflow-hidden ${
        fullScreen ? "h-[100dvh]" : "h-[70vh] min-h-[420px] rounded-md"
      }`}
      style={{ backgroundColor: layout.backgroundColor ?? undefined }}
    >
      <div ref={scrollRef} onScroll={onScroll} className="absolute inset-0 overflow-auto">
        <div
          className="relative cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
          style={{ width, height }}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        >
          {placements.map((p) => {
            const cover = covers.get(p.curationId);
            const isOpen = p === open;
            const opened = isOpen ? openedRects(p) : null;
            const closed = closedRect(p);
            const curationWorks = works.get(p.curationId) ?? [];
            // Closed, the smaller images wait hidden, centred behind the
            // cover.
            const hidden: Rect = {
              left: closed.left + (T - small) / 2,
              top: closed.top + (T - small) / 2,
              size: small,
            };
            return (
              <div key={p.curationId}>
                {curationWorks.slice(1).map((w, i) => (
                  <button
                    key={w.artworkId}
                    type="button"
                    onClick={() => setViewing({ curationId: p.curationId, artworkId: w.artworkId })}
                    title={w.catalogueName}
                    className="absolute overflow-hidden rounded"
                    style={rectStyle(opened ? opened[i + 1] : hidden, small, {
                      opacity: opened ? 1 : 0,
                      pointerEvents: opened ? "auto" : "none",
                      zIndex: isOpen ? 10 : 0,
                    })}
                  >
                    <img
                      src={w.displayUrl!}
                      alt={w.catalogueName}
                      draggable={false}
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    isOpen && curationWorks[0]
                      ? setViewing({ curationId: p.curationId, artworkId: curationWorks[0].artworkId })
                      : scrollToCentre(p)
                  }
                  title={cover?.name}
                  className="absolute overflow-hidden rounded bg-neutral-200"
                  style={rectStyle(opened ? opened[0] : closed, main, { zIndex: isOpen ? 10 : 1 })}
                >
                  {cover?.imageUrl && (
                    <img
                      src={cover.imageUrl}
                      alt={cover.name}
                      draggable={false}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  )}
                  {/* Sized for the closed cover; grows with it when open. */}
                  <span
                    className="absolute inset-x-0 bottom-0 truncate bg-black/45 px-2 py-1 text-left text-white"
                    style={{ fontSize: (NAME_FONT_SIZE * main) / T }}
                  >
                    {cover?.name ?? ""}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {viewing && (
        <CurationPanel
          curationId={viewing.curationId}
          artworkId={viewing.artworkId}
          onClose={closePanel}
        />
      )}
    </div>
  );
}
