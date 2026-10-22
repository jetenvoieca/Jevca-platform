"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { CurationWork } from "@/lib/actions/curations";
import type { HeroText } from "@/lib/pageComponents";
import type { HeroSettings, PageTextStyle } from "@/lib/pageStyleLayout";
import { bodyTextCss } from "@/components/textStyleCss";

// A Hero on a page (2026-10-22, from Louise Dear's home page — see
// HeroSettings in lib/pageStyleLayout.ts): the small line in spaced
// capitals, the headline and its second line on the left; on the right
// the works, one at a time, each fading into the next every
// `hero.seconds`. Clicking the picture opens that work. On a desktop the
// picture sits against the right edge, lining up with the components
// below it (2026-10-22); on a phone it's centred. Beside each
// other from md (768px) up, the words above the picture on a phone. The
// headline sizes shrink with a narrow screen, never below about half.
export default function HeroBlock({
  works,
  text,
  hero,
  onOpen,
}: {
  works: CurationWork[];
  text: HeroText;
  hero: HeroSettings;
  onOpen: (artworkId: string) => void;
}) {
  const shown = useMemo(() => works.filter((w) => w.displayUrl), [works]);
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [shown]);
  useEffect(() => {
    if (shown.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % shown.length), hero.seconds * 1000);
    return () => clearInterval(timer);
  }, [shown.length, hero.seconds]);

  const current = shown[index];

  return (
    <div
      className="flex flex-col gap-10 md:grid md:items-center md:gap-[6%]"
      style={{ gridTemplateColumns: `1fr ${hero.pictureShare}%` }}
    >
      <div className="flex min-w-0 flex-col gap-6">
        {text.kicker && (
          <p className="uppercase tracking-[0.2em]" style={bodyTextCss(hero.kicker)}>
            {text.kicker}
          </p>
        )}
        {(text.headline || text.accent) && (
          <h1 className="font-normal">
            {text.headline && (
              <span className="block whitespace-pre-line" style={headlineCss(hero.headline)}>
                {text.headline}
              </span>
            )}
            {text.accent && (
              <span className="block whitespace-pre-line" style={headlineCss(hero.accent)}>
                {text.accent}
              </span>
            )}
          </h1>
        )}
      </div>

      {current && (
        <button
          type="button"
          onClick={() => onOpen(current.artworkId)}
          title={current.catalogueName}
          className="grid min-w-0 cursor-pointer justify-items-center md:justify-items-end"
        >
          {shown.map((w, i) => (
            <img
              key={w.artworkId}
              src={w.displayUrl!}
              alt={w.catalogueName}
              aria-hidden={i !== index}
              className="col-start-1 row-start-1 w-auto max-w-full self-center object-contain"
              style={{
                maxHeight: `${hero.height}vh`,
                opacity: i === index ? 1 : 0,
                transition: `opacity ${hero.fade}s ease-in-out`,
              }}
            />
          ))}
        </button>
      )}
    </div>
  );
}

// A headline line: its look, tightly spaced, its size shrinking on a
// narrow screen.
function headlineCss(style: PageTextStyle): CSSProperties {
  const size = style.size ?? 48;
  return {
    ...bodyTextCss(style),
    fontSize: `clamp(${Math.round(size * 0.55)}px, ${(size / 14).toFixed(2)}vw, ${size}px)`,
    lineHeight: 1.1,
  };
}
