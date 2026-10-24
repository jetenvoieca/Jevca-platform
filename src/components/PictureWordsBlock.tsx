import type { CSSProperties } from "react";
import { pictureShapeRatio, type PageTextStyle, type PictureWordsSettings } from "@/lib/pageStyleLayout";
import { bodyTextCss } from "@/components/textStyleCss";
import FadeImage from "@/components/FadeImage";

// A Picture & words on a page (2026-10-24, from Louise Dear's Story page
// — see PictureWordsSettings in lib/pageStyleLayout.ts): the picture
// filling a box of its shape on its side, beside the typed headline and
// its second line, then the Description. Stacked on a phone (narrower
// than 700px — lib/siteBreakpoint.ts), the picture first if set. A
// work's picture opens it when clicked (`onOpen`). Sizes shrink with the
// page (bodyTextCss, `contentWidth` = the page's contents as designed).
export default function PictureWordsBlock({
  settings,
  picture,
  headline,
  accent,
  body,
  contentWidth,
  onOpen,
}: {
  settings: PictureWordsSettings;
  picture: { url: string; alt: string } | null;
  headline: string;
  accent: string;
  body: string | null;
  contentWidth: number;
  onOpen?: () => void;
}) {
  const s = settings;
  const pictureFirst = s.side === "left";
  const columns = pictureFirst
    ? `${s.pictureShare}fr ${100 - s.pictureShare}fr`
    : `${100 - s.pictureShare}fr ${s.pictureShare}fr`;
  const frame = {
    "--pw-columns": columns,
    "--pw-gap": `${s.gap.desktop}px`,
    "--pw-gap-phone": `${s.gap.phone}px`,
    "--pw-shape": pictureShapeRatio(s.shape.desktop),
    "--pw-shape-phone": pictureShapeRatio(s.shape.phone),
  } as CSSProperties;
  const big = (style: PageTextStyle): CSSProperties => ({ ...bodyTextCss(style, contentWidth), lineHeight: 1.1 });

  // Phone order by `pictureFirstOnPhone`; desktop order by `side`.
  const pictureOrder = `${s.pictureFirstOnPhone ? "order-1" : "order-2"} ${pictureFirst ? "site:order-1" : "site:order-2"}`;
  const wordsOrder = `${s.pictureFirstOnPhone ? "order-2" : "order-1"} ${pictureFirst ? "site:order-2" : "site:order-1"}`;

  const image = picture && (
    <FadeImage src={picture.url} alt={picture.alt} className="absolute inset-0 h-full w-full object-cover" />
  );

  return (
    <div
      className={`flex flex-col gap-[var(--pw-gap-phone)] site:grid site:grid-cols-[var(--pw-columns)] site:gap-[var(--pw-gap)] ${
        s.wordsAt === "middle" ? "site:items-center" : "site:items-start"
      }`}
      style={frame}
    >
      {picture &&
        (onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            title={picture.alt}
            className={`relative block aspect-[var(--pw-shape-phone)] w-full min-w-0 overflow-hidden hover:opacity-90 site:aspect-[var(--pw-shape)] ${pictureOrder}`}
          >
            {image}
          </button>
        ) : (
          <div
            className={`relative aspect-[var(--pw-shape-phone)] w-full min-w-0 overflow-hidden site:aspect-[var(--pw-shape)] ${pictureOrder}`}
          >
            {image}
          </div>
        ))}
      <div className={`min-w-0 ${wordsOrder}`}>
        {(headline || accent) && (
          <h2 className="font-normal" style={{ marginBottom: s.headlineSpace }}>
            {headline && (
              <span className="block whitespace-pre-line" style={big(s.headline)}>
                {headline}
              </span>
            )}
            {accent && (
              <span className="block whitespace-pre-line" style={big(s.accent)}>
                {accent}
              </span>
            )}
          </h2>
        )}
        {body && (
          <p
            className="whitespace-pre-line break-words"
            style={{ ...bodyTextCss(s.body, contentWidth), lineHeight: 1.8 }}
          >
            {body}
          </p>
        )}
      </div>
    </div>
  );
}
