import type { CSSProperties, ReactNode } from "react";
import { wordsPictureRatio, type PageTextStyle, type PictureWordsLook } from "@/lib/pageStyleLayout";
import type { SectionMedia } from "@/lib/curationSections";
import { bodyTextCss } from "@/components/textStyleCss";
import SectionMediaView from "@/components/SectionMediaView";
import SoldFlag from "@/components/SoldFlag";

// The picture: a work's, or one of the Supporting Media — a picture or
// (2026-10-25) a video, shown with ▶ and played in its box. A sold work
// carries the SOLD flag (`sold`, 2026-10-26).
export type PictureWordsPicture = {
  media: Pick<SectionMedia, "kind" | "url" | "posterUrl">;
  alt: string;
  sold?: boolean;
};

// A Picture & words on a page (2026-10-24, from Louise Dear's Story page
// — see PictureWordsSettings in lib/pageStyleLayout.ts): the picture
// filling a box of its shape on its side, beside the typed headline and
// its second line, then the Description. Stacked on a phone (narrower
// than 700px — lib/siteBreakpoint.ts), the picture first if set. A
// work's picture opens it when clicked (`onOpen`). Sizes shrink with the
// page (bodyTextCss, `contentWidth` = the page's contents as designed).
// Also draws each of Profile stories' stories (2026-10-26), which have no
// second line (`accent` look not given) — and under a Galleries entry's
// text, its list of galleries (`after`, 2026-11-03).
export default function PictureWordsBlock({
  settings,
  picture,
  headline,
  accent,
  body,
  after,
  contentWidth,
  onOpen,
}: {
  settings: PictureWordsLook & { accent?: PageTextStyle };
  picture: PictureWordsPicture | null;
  headline: string;
  accent: string;
  body: string | null;
  after?: ReactNode;
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
    "--pw-shape": wordsPictureRatio(s.shape.desktop),
    "--pw-shape-phone": wordsPictureRatio(s.shape.phone),
  } as CSSProperties;
  const big = (style: PageTextStyle): CSSProperties => ({ ...bodyTextCss(style, contentWidth), lineHeight: 1.1 });

  // Phone order by `pictureFirstOnPhone`; desktop order by `side`.
  const pictureOrder = `${s.pictureFirstOnPhone ? "order-1" : "order-2"} ${pictureFirst ? "site:order-1" : "site:order-2"}`;
  const wordsOrder = `${s.pictureFirstOnPhone ? "order-2" : "order-1"} ${pictureFirst ? "site:order-2" : "site:order-1"}`;

  // The picture fills its box, cropped to the box's shape — or, shown
  // whole (2026-11-03), sets the box's height itself.
  const fit = `${s.shape.phone === "whole" ? "h-auto" : "h-full object-cover"} ${
    s.shape.desktop === "whole" ? "site:h-auto site:object-fill" : "site:h-full site:object-cover"
  }`;
  const image = picture && (
    <>
      <SectionMediaView media={picture.media} alt={picture.alt} className={fit} />
      {picture.sold && <SoldFlag />}
    </>
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
      {/* With no picture (2026-11-03 — e.g. a Biography / CV without
          one), the words take the full width. */}
      <div className={`min-w-0 ${wordsOrder} ${picture ? "" : "site:col-span-2"}`}>
        {(headline || (accent && s.accent)) && (
          <h2 className="font-normal" style={{ marginBottom: s.headlineSpace }}>
            {headline && (
              <span className="block whitespace-pre-line" style={big(s.headline)}>
                {headline}
              </span>
            )}
            {accent && s.accent && (
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
        {after}
      </div>
    </div>
  );
}
