"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CurationWork } from "@/lib/actions/curations";
import type { DoorsHeight } from "@/lib/pageStyleLayout";
import type { PageMargins } from "@/lib/rowLayout";

// Phones are narrower than this (Tailwind's md), as for the page margin.
const PHONE_WIDTH = 768;

// Sliding doors (2026-10-05, from Craig's mockup) — a curation's main
// images, a slide at a time, on a continuous loop. After `duration`
// seconds the slide moves away over `speed` seconds, revealing the next
// slide already sitting behind it.
// - perSlide 2: a pair, `gap` pixels apart; the first image moves off
//   one way and the second the other. Works are paired in curation order
//   (1+2, 3+4…); with an odd number the last pairs with the first. The
//   page's background shows in the gap.
// - perSlide 1 (e.g. a home page): one image at a time.
// Each image fills a square panel (2026-10-06, so a wide screen no
// longer crops it to a strip): as tall as `height` — % of the screen
// height inside the page's top & bottom `margins` — or smaller if the
// space is too narrow, centred. On larger screens a pair sits side by
// side and slides left/right (a single image slides left); on phones
// (narrower than 768px) the pair is stacked and slides up/down (a single
// image slides up). Works without an image are left out. Clicking an
// image opens that work (onOpen).
export default function SlidingDoors({
  works,
  duration,
  speed,
  gap,
  perSlide,
  height,
  margins,
  onOpen,
}: {
  works: CurationWork[];
  duration: number;
  speed: number;
  gap: number;
  perSlide: 1 | 2;
  height: DoorsHeight;
  margins: PageMargins;
  onOpen: (artworkId: string) => void;
}) {
  const slides = useMemo(() => {
    const shown = works.filter((w) => w.displayUrl);
    if (perSlide === 1) return shown.map((w) => [w]);
    const out: CurationWork[][] = [];
    for (let i = 0; i < shown.length; i += 2) out.push([shown[i], shown[i + 1] ?? shown[0]]);
    return out;
  }, [works, perSlide]);

  const [index, setIndex] = useState(0);
  const [opening, setOpening] = useState(false);

  // A different set of slides starts again from the first.
  useEffect(() => {
    setIndex(0);
    setOpening(false);
  }, [slides]);

  // Waits `duration`, then opens; once open (`speed` later), the next
  // slide becomes the front slide, closed again, and the wait restarts.
  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setTimeout(
      () => {
        if (opening) {
          setIndex((i) => (i + 1) % slides.length);
          setOpening(false);
        } else {
          setOpening(true);
        }
      },
      (opening ? speed : duration) * 1000
    );
    return () => clearTimeout(timer);
  }, [opening, index, slides.length, duration, speed]);

  const spacing = perSlide === 2 ? gap : 0;
  const boxRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<{ side: number; phone: boolean } | null>(null);
  const { desktop: desktopHeight, phone: phoneHeight } = height;
  const desktopMargin = margins.desktop.vertical;
  const phoneMargin = margins.phone.vertical;

  // The panels' size, measured in the browser and again whenever the
  // window or the space for the block changes size.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const phone = window.innerWidth < PHONE_WIDTH;
      const percent = phone ? phoneHeight : desktopHeight;
      const margin = phone ? phoneMargin : desktopMargin;
      const tall = ((window.innerHeight - 2 * margin) * percent) / 100;
      const wide = box.clientWidth;
      const fit =
        perSlide === 1
          ? Math.min(wide, tall)
          : phone
            ? Math.min(wide, (tall - spacing) / 2)
            : Math.min((wide - spacing) / 2, tall);
      const side = Math.max(0, Math.floor(fit));
      setPanel((p) => (p && p.side === side && p.phone === phone ? p : { side, phone }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [perSlide, spacing, desktopHeight, phoneHeight, desktopMargin, phoneMargin]);

  let frame: ReactNode = null;
  if (panel && panel.side > 0 && slides.length > 0) {
    const { side, phone } = panel;
    const stacked = phone && perSlide === 2;
    const current = slides[index % slides.length];
    const next = slides[(index + 1) % slides.length];
    const rowClass = `absolute inset-0 flex ${stacked ? "flex-col" : "flex-row"}`;
    const axis = phone ? "translateY" : "translateX";

    frame = (
      <div
        className="relative overflow-hidden"
        style={{
          width: stacked ? side : perSlide * side + spacing,
          height: stacked ? 2 * side + spacing : side,
        }}
      >
        {slides.length > 1 && (
          <div className={rowClass} style={{ gap: spacing }} aria-hidden>
            {next.map((w, i) => (
              <img
                key={i}
                src={w.displayUrl!}
                alt=""
                className="min-h-0 min-w-0 flex-1 object-cover"
              />
            ))}
          </div>
        )}

        {/* Keyed by slide, so each new front slide starts closed with no
            animation. Each image moves its own height (phones) or width
            (larger screens), which takes it exactly off its side whatever
            the gap: the first image (or the only one) up / left, the
            second down / right. */}
        <div key={index} className={rowClass} style={{ gap: spacing }}>
          {current.map((w, i) => {
            const distance = opening ? (i === 0 ? "-100%" : "100%") : "0%";
            return (
              <button
                key={i}
                type="button"
                onClick={() => onOpen(w.artworkId)}
                title={w.catalogueName}
                className="min-h-0 min-w-0 flex-1 overflow-hidden"
                style={{
                  transform: `${axis}(${distance})`,
                  transition: opening ? `transform ${speed}s ease-in-out` : "none",
                }}
              >
                <img
                  src={w.displayUrl!}
                  alt={w.catalogueName}
                  className="h-full w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="flex w-full justify-center">
      {frame}
    </div>
  );
}
