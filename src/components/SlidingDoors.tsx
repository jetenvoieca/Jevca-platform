"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { CurationWork } from "@/lib/actions/curations";

// Sliding doors (2026-10-05, from Craig's mockup) — a curation's main
// images shown full screen, a slide at a time, on a continuous loop.
// After `duration` seconds the slide moves away over `speed` seconds,
// revealing the next slide already sitting behind it.
// - perSlide 2: a pair, `gap` pixels apart; the first image moves off
//   one way and the second the other. Works are paired in curation order
//   (1+2, 3+4…); with an odd number the last pairs with the first. The
//   page's background shows in the gap.
// - perSlide 1 (e.g. a home page): one image at a time.
// Direction follows the screen (2026-10-05): on larger screens the pair
// sits side by side and slides left/right (a single image slides left);
// on phones (narrower than Tailwind's md, 768px) the pair is stacked and
// slides up/down (a single image slides up). Works without an image are
// left out. Clicking an image opens that work (onOpen).
export default function SlidingDoors({
  works,
  duration,
  speed,
  gap,
  perSlide,
  onOpen,
}: {
  works: CurationWork[];
  duration: number;
  speed: number;
  gap: number;
  perSlide: 1 | 2;
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

  if (slides.length === 0) return null;

  const current = slides[index % slides.length];
  const next = slides[(index + 1) % slides.length];
  const spacing = perSlide === 2 ? gap : 0;

  // Stacked on phones, side by side from md up.
  const rowClass = "absolute inset-0 flex flex-col md:flex-row";

  return (
    <div className="relative h-[75vh] w-full overflow-hidden">
      {slides.length > 1 && (
        <div className={rowClass} style={{ gap: spacing }} aria-hidden>
          {next.map((w, side) => (
            <img
              key={side}
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
          the gap: the first image (or the only one) up / left, the second
          down / right. The distance is set as a CSS variable and the
          screen size picks which one applies. */}
      <div key={index} className={rowClass} style={{ gap: spacing }}>
        {current.map((w, side) => {
          const distance = opening ? (side === 0 ? "-100%" : "100%") : "0%";
          const style = {
            "--slide": distance,
            transition: opening ? `transform ${speed}s ease-in-out` : "none",
          } as CSSProperties;
          return (
            <button
              key={side}
              type="button"
              onClick={() => onOpen(w.artworkId)}
              title={w.catalogueName}
              className="min-h-0 min-w-0 flex-1 overflow-hidden [transform:translateY(var(--slide))] md:[transform:translateX(var(--slide))]"
              style={style}
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
