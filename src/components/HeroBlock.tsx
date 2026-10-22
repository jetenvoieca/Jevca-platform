"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { CurationWork } from "@/lib/actions/curations";
import type { HeroText } from "@/lib/pageComponents";
import { heroShapeRatio, type HeroSettings } from "@/lib/pageStyleLayout";
import { bodyTextCss } from "@/components/textStyleCss";

// A Hero on a page (2026-10-22, from Louise Dear's home page — see
// HeroSettings in lib/pageStyleLayout.ts): the words — small line in
// capitals, headline, its second line, the line under them — and the
// works, one at a time, each fading into the next every `hero.seconds`,
// paused while the pointer is over the picture or the page is in the
// background. Each work is shown whole in a box of the Hero's shape.
// Clicking the picture opens that work; `onShowing` hears which work is
// showing. Beside each other from 700px up (lib/siteBreakpoint.ts),
// stacked on a phone. The words' sizes shrink with the page (bodyTextCss,
// `contentWidth` = the page's contents as designed).
export default function HeroBlock({
  works,
  text,
  hero,
  contentWidth,
  onOpen,
  onShowing,
}: {
  works: CurationWork[];
  text: HeroText;
  hero: HeroSettings;
  contentWidth: number;
  onOpen: (artworkId: string) => void;
  onShowing?: (artworkId: string | null) => void;
}) {
  const shown = useMemo(() => works.filter((w) => w.displayUrl), [works]);
  const [index, setIndex] = useState(0);
  const paused = useRef(false);

  useEffect(() => setIndex(0), [shown]);
  useEffect(() => {
    if (shown.length < 2) return;
    const timer = setInterval(() => {
      if (paused.current || document.hidden) return;
      setIndex((i) => (i + 1) % shown.length);
    }, hero.seconds * 1000);
    return () => clearInterval(timer);
  }, [shown.length, hero.seconds]);

  const current = shown[index];
  const currentId = current?.artworkId ?? null;
  useEffect(() => onShowing?.(currentId), [onShowing, currentId]);

  const frame = {
    "--hero-columns": `${100 - hero.pictureShare}fr ${hero.pictureShare}fr`,
    "--hero-gap": `${hero.gap.desktop}px`,
    "--hero-gap-phone": `${hero.gap.phone}px`,
    "--hero-shape": heroShapeRatio(hero.shape.desktop),
    "--hero-shape-phone": heroShapeRatio(hero.shape.phone),
  } as CSSProperties;
  const big = (style: HeroSettings["headline"]): CSSProperties => ({
    ...bodyTextCss(style, contentWidth),
    lineHeight: 1.1,
  });

  return (
    <div
      className="flex flex-col gap-[var(--hero-gap-phone)] site:grid site:grid-cols-[var(--hero-columns)] site:items-center site:gap-[var(--hero-gap)]"
      style={frame}
    >
      <div className="flex min-w-0 flex-col gap-6">
        {text.kicker && (
          <p className="uppercase" style={bodyTextCss(hero.kicker, contentWidth)}>
            {text.kicker}
          </p>
        )}
        {(text.headline || text.accent) && (
          <h1 className="font-normal">
            {text.headline && (
              <span className="block whitespace-pre-line" style={big(hero.headline)}>
                {text.headline}
              </span>
            )}
            {text.accent && (
              <span className="block whitespace-pre-line" style={big(hero.accent)}>
                {text.accent}
              </span>
            )}
          </h1>
        )}
        {text.below && (
          <p className="whitespace-pre-line" style={{ ...bodyTextCss(hero.below, contentWidth), lineHeight: 1.8 }}>
            {text.below}
          </p>
        )}
      </div>

      {current && (
        <button
          type="button"
          onClick={() => onOpen(current.artworkId)}
          onPointerEnter={() => (paused.current = true)}
          onPointerLeave={() => (paused.current = false)}
          title={current.catalogueName}
          className={`relative block aspect-[var(--hero-shape-phone)] w-full min-w-0 cursor-pointer overflow-hidden site:aspect-[var(--hero-shape)] ${
            hero.pictureFirstOnPhone ? "order-first site:order-none" : ""
          }`}
        >
          {shown.map((w, i) => (
            <img
              key={w.artworkId}
              src={w.displayUrl!}
              alt={w.catalogueName}
              aria-hidden={i !== index}
              className="absolute inset-0 h-full w-full object-contain"
              style={{ opacity: i === index ? 1 : 0, transition: `opacity ${hero.fade}s ease` }}
            />
          ))}
        </button>
      )}
    </div>
  );
}
