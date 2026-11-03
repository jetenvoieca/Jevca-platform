"use client";

import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { DynamicItem, DynamicMedia, DynamicSection } from "@/lib/dynamicPresentation";
import { SITE_FONT_FAMILY } from "@/lib/siteFontFaces";

// One section of a Dynamic presentation (2026-11-03 — see
// lib/dynamicPresentation.ts), drawn the same in its editor and on the
// site: a box of its shape — its colour, with its picture (cover) or
// looping, silent video over it — holding its items where they were
// placed. It measures itself (a container), so text sized as a % of its
// width scales with it. `renderItem` wraps each item (the editor's
// dragging, the site's clicking); `children` go on top (the editor's
// outline). With `animate` (2026-11-03, phase two) the items make their
// entrances once a fifth of the section has scrolled into view — without,
// everything simply shows (the editor, until its Play). Each item sits in
// its frame: a card or a cut corner. Animated, it also follows the scroll
// by its depth (parallax): the section keeps --scroll-p, how far its
// middle is from the middle of the window (−1 above … 1 below, roughly),
// and each item with a depth is moved by it. Nothing moves for a visitor
// who asks their device for less motion.

// How far an item slides in from, as a % of its section's width; how much
// smaller it grows from.
const SLIDE = 6;
const GROW_FROM = 0.8;
// A cut corner: the top right, a fifth of the way along each side.
const CUT_CORNER = "polygon(0 0, 80% 0, 100% 20%, 100% 100%, 0 100%)";
// How far an item moves at full scroll for each step of depth, as a % of
// its section's width.
const DEPTH_STEP = 1.5;

// A work of the curation, as an item shows it — the works come from the
// curation, given by whoever draws the presentation.
export type DynamicWork = { url: string | null; name: string };
export const DynamicWorksContext = createContext<Map<string, DynamicWork>>(new Map());

export function DynamicSectionBox({
  section,
  media,
  renderItem,
  children,
  animate = false,
}: {
  section: DynamicSection;
  media: DynamicMedia;
  renderItem: (item: DynamicItem, content: ReactNode, style: CSSProperties) => ReactNode;
  children?: ReactNode;
  animate?: boolean;
}) {
  const background = section.backgroundImageId ? media[section.backgroundImageId] : undefined;
  const boxRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    setMoving(animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, [animate]);

  // Keeps --scroll-p up to date while anything scrolls (the window, or
  // the presentation's own scrolling layer), once a frame.
  const hasDepth = section.items.some((i) => i.depth !== 0);
  useEffect(() => {
    const box = boxRef.current;
    if (!moving || !hasDepth || !box) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const r = box.getBoundingClientRect();
      const p = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
      box.style.setProperty("--scroll-p", Math.max(-1.5, Math.min(1.5, p)).toFixed(4));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [moving, hasDepth]);

  useEffect(() => {
    const box = boxRef.current;
    if (!moving || !box) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(box);
    return () => observer.disconnect();
  }, [moving]);
  const shown = !moving || inView;

  return (
    <div
      ref={boxRef}
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: `100 / ${section.height}`, background: section.colour, containerType: "inline-size" }}
    >
      {background?.kind === "VIDEO" ? (
        <video
          src={background.url}
          poster={background.posterUrl ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        background && (
          <img src={background.url} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
        )
      )}
      {section.items.map((item) => (
        <ItemSlot key={item.id} item={item} media={media} renderItem={renderItem} shown={shown} moving={moving} />
      ))}
      {children}
    </div>
  );
}

// Where an item sits, and what it shows.
function ItemSlot({
  item,
  media,
  renderItem,
  shown,
  moving,
}: {
  item: DynamicItem;
  media: DynamicMedia;
  renderItem: (item: DynamicItem, content: ReactNode, style: CSSProperties) => ReactNode;
  shown: boolean;
  moving: boolean;
}) {
  const style: CSSProperties = { position: "absolute", left: `${item.x}%`, top: `${item.y}%`, width: `${item.w}%` };
  // Further back (positive depth) lags behind the scroll; nearer runs ahead.
  const depthStyle: CSSProperties | undefined =
    moving && item.depth !== 0
      ? { transform: `translateY(calc(var(--scroll-p, 0) * ${-item.depth * DEPTH_STEP}cqw))`, willChange: "transform" }
      : undefined;
  const content = (
    <div style={depthStyle}>
      <div style={entranceStyle(item, shown)}>
        <Framed item={item}>
          <DynamicItemContent item={item} media={media} />
        </Framed>
      </div>
    </div>
  );
  return <>{renderItem(item, content, style)}</>;
}

// An item before and after its entrance.
function entranceStyle(item: DynamicItem, shown: boolean): CSSProperties | undefined {
  if (item.entrance === "none") return undefined;
  const from: Record<Exclude<DynamicItem["entrance"], "none">, string> = {
    fade: "none",
    up: `translateY(${SLIDE}cqw)`,
    down: `translateY(-${SLIDE}cqw)`,
    left: `translateX(${SLIDE}cqw)`,
    right: `translateX(-${SLIDE}cqw)`,
    grow: `scale(${GROW_FROM})`,
  };
  const timing = `${item.duration}s cubic-bezier(0.2, 0.8, 0.2, 1) ${item.delay}s`;
  return {
    opacity: shown ? 1 : 0,
    transform: shown ? "none" : from[item.entrance],
    transition: `opacity ${timing}, transform ${timing}`,
  };
}

// An item's frame: a card (white, rounded, a soft shadow, a margin round
// it) or a cut corner — or none.
function Framed({ item, children }: { item: DynamicItem; children: ReactNode }) {
  if (item.frame === "card") {
    return (
      <div className="bg-white" style={{ padding: "6%", borderRadius: "1cqw", boxShadow: "0 0.8cqw 2.4cqw rgba(0,0,0,0.14)" }}>
        {children}
      </div>
    );
  }
  if (item.frame === "cut") return <div style={{ clipPath: CUT_CORNER }}>{children}</div>;
  return <>{children}</>;
}

function DynamicItemContent({ item, media }: { item: DynamicItem; media: DynamicMedia }) {
  const works = useContext(DynamicWorksContext);
  if (item.kind === "text") {
    return (
      <p
        className="whitespace-pre-line break-words leading-tight"
        style={{
          fontFamily: SITE_FONT_FAMILY[item.font],
          fontSize: `${item.size}cqw`,
          color: item.colour,
          fontWeight: item.bold ? 700 : 400,
        }}
      >
        {item.text || " "}
      </p>
    );
  }
  const url = item.kind === "work" ? (works.get(item.artworkId ?? "")?.url ?? null) : (media[item.imageId ?? ""]?.url ?? null);
  const name = item.kind === "work" ? (works.get(item.artworkId ?? "")?.name ?? "") : "";
  const video = item.kind === "media" && media[item.imageId ?? ""]?.kind === "VIDEO";
  if (!url) return <div className="aspect-square w-full bg-black/10" />;
  return video ? (
    <video src={url} autoPlay muted loop playsInline className="pointer-events-none block w-full" />
  ) : (
    <img src={url} alt={name} draggable={false} className="pointer-events-none block w-full select-none" />
  );
}
