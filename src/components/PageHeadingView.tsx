"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PageHeadingSettings } from "@/lib/pageStyleLayout";
import type { HeadingText } from "@/lib/pageHeading";
import { bodyTextCss } from "@/components/textStyleCss";

// A Page heading on a page (2026-10-25, the ISYT sites — see
// PageHeadingSettings and lib/pageHeading.ts): the site's name over the
// page's name, each in its look, with the line under them if set. Sizes
// shrink with the page (bodyTextCss, `contentWidth` = the page's contents
// as designed). A page's name that would just run onto a second line is
// made a little smaller to stay on one (OneLine, 2026-11-03, Craig's
// request); one far too long for that wraps at its own size.
export default function PageHeadingView({
  settings,
  lines,
  contentWidth,
}: {
  settings: PageHeadingSettings;
  lines: HeadingText;
  contentWidth?: number;
}) {
  const s = settings;
  return (
    <div
      style={{
        paddingBottom: s.line ? s.lineSpace : 0,
        borderBottom: s.line ? `${s.line.thickness}px solid ${s.line.colour}` : undefined,
      }}
    >
      {lines.name && (
        <p className="break-words leading-tight" style={bodyTextCss(s.name, contentWidth)}>
          {lines.name}
        </p>
      )}
      {lines.page && (
        <h1
          className="break-words font-normal leading-tight"
          style={{ ...bodyTextCss(s.page, contentWidth), marginTop: lines.name ? s.gap : 0 }}
        >
          <OneLine>{lines.page}</OneLine>
        </h1>
      )}
    </div>
  );
}

// The smallest a page's name is made (of its own size) to stay on one line.
const SMALLEST = 0.7;

// Its words on one line, smaller if need be (down to SMALLEST); otherwise
// wrapping as usual. Measured against a hidden copy on one line at full
// size, again whenever the space or the words' width (fonts loading)
// change.
function OneLine({ children }: { children: ReactNode }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);
  const [wraps, setWraps] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    const measure = measureRef.current;
    if (!box || !measure) return;
    const update = () => {
      const full = measure.getBoundingClientRect().width;
      const room = box.getBoundingClientRect().width;
      if (!full || !room) return;
      const fit = Math.min(1, (room / full) * 0.99);
      setWraps(fit < SMALLEST);
      setScale(fit < SMALLEST ? 1 : fit);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [children]);

  return (
    <span ref={boxRef} className="relative block">
      <span
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap"
      >
        {children}
      </span>
      <span className={wraps ? undefined : "whitespace-nowrap"} style={{ fontSize: `${scale}em` }}>
        {children}
      </span>
    </span>
  );
}
