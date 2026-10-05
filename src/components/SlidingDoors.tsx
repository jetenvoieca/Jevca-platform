"use client";

import { useEffect, useMemo, useState } from "react";
import type { CurationWork } from "@/lib/actions/curations";

// Sliding doors (2026-10-05, from Craig's mockup) — a curation's main
// images a pair at a time, side by side, full screen. After `duration`
// seconds the pair slides apart (left image off to the left, right image
// off to the right) over `speed` seconds, revealing the next pair
// already sitting behind it; then it repeats, looping back to the first
// pair. Works are paired in curation order (1+2, 3+4…); with an odd
// number the last pairs with the first. Works without an image are left
// out. Clicking an image opens that work (onOpen).
export default function SlidingDoors({
  works,
  duration,
  speed,
  onOpen,
}: {
  works: CurationWork[];
  duration: number;
  speed: number;
  onOpen: (artworkId: string) => void;
}) {
  const pairs = useMemo(() => {
    const shown = works.filter((w) => w.displayUrl);
    const out: [CurationWork, CurationWork][] = [];
    for (let i = 0; i < shown.length; i += 2) out.push([shown[i], shown[i + 1] ?? shown[0]]);
    return out;
  }, [works]);

  const [index, setIndex] = useState(0);
  const [opening, setOpening] = useState(false);

  // A different set of works starts again from the first pair.
  useEffect(() => {
    setIndex(0);
    setOpening(false);
  }, [pairs]);

  // Waits `duration`, then opens; once open (`speed` later), the next
  // pair becomes the front pair, closed again, and the wait restarts.
  useEffect(() => {
    if (pairs.length < 2) return;
    const timer = setTimeout(
      () => {
        if (opening) {
          setIndex((i) => (i + 1) % pairs.length);
          setOpening(false);
        } else {
          setOpening(true);
        }
      },
      (opening ? speed : duration) * 1000
    );
    return () => clearTimeout(timer);
  }, [opening, index, pairs.length, duration, speed]);

  if (pairs.length === 0) return null;

  const current = pairs[index % pairs.length];
  const next = pairs[(index + 1) % pairs.length];

  return (
    <div className="relative h-[75vh] w-full overflow-hidden rounded-md bg-neutral-100">
      {pairs.length > 1 && (
        <div className="absolute inset-0 flex" aria-hidden>
          {next.map((w, side) => (
            <img
              key={side}
              src={w.displayUrl!}
              alt=""
              className="h-full w-1/2 object-cover"
            />
          ))}
        </div>
      )}

      {/* Keyed by pair, so each new front pair starts closed with no
          animation. */}
      <div key={index} className="absolute inset-0 flex">
        {current.map((w, side) => (
          <button
            key={side}
            type="button"
            onClick={() => onOpen(w.artworkId)}
            title={w.catalogueName}
            className="h-full w-1/2 overflow-hidden"
            style={{
              transform: opening ? `translateX(${side === 0 ? "-100%" : "100%"})` : "translateX(0)",
              transition: opening ? `transform ${speed}s ease-in-out` : "none",
            }}
          >
            <img
              src={w.displayUrl!}
              alt={w.catalogueName}
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
