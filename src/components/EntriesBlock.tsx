import type { CSSProperties } from "react";
import { pictureShapeRatio, type EntriesSettings } from "@/lib/pageStyleLayout";
import type { PageEntry } from "@/lib/pageEntries";
import { bodyTextCss } from "@/components/textStyleCss";
import type { SectionMedia } from "@/lib/curationSections";
import SectionMediaView from "@/components/SectionMediaView";

// An Entries list on a page (2026-10-24, from Louise Dear's Events &
// Projects — see EntriesSettings in lib/pageStyleLayout.ts and
// lib/pageEntries.ts): each shown entry's date and title, then its
// pictures, each beside its description with its caption under it — the
// picture the full width above its description on a phone (narrower than
// 700px, lib/siteBreakpoint.ts). A line between entries. `media` gives
// one of the curation's Supporting Media by its id — a picture or
// (2026-10-25) a video, played in its box (null = no longer in the
// curation, so not shown). Sizes shrink with the page (bodyTextCss).
export default function EntriesBlock({
  settings,
  entries,
  media,
  contentWidth,
}: {
  settings: EntriesSettings;
  entries: PageEntry[];
  media: (imageId: string) => SectionMedia | null;
  contentWidth: number;
}) {
  const s = settings;
  const shown = entries.filter((e) => !e.hidden);
  const frame = {
    "--entry-picture": `${s.pictureWidth}px`,
    "--entry-gap": `${s.gap}px`,
  } as CSSProperties;
  const css = (style: EntriesSettings["text"]) => bodyTextCss(style, contentWidth);

  return (
    <div style={frame}>
      {shown.map((entry, i) => {
        const last = i === shown.length - 1;
        return (
          <div
            key={entry.id}
            style={
              last
                ? undefined
                : {
                    paddingBottom: s.entrySpace,
                    marginBottom: s.entrySpace,
                    borderBottom: s.line ? `${s.line.thickness}px solid ${s.line.colour}` : undefined,
                  }
            }
          >
            {(entry.date || entry.title) && (
              <div style={{ marginBottom: s.titleSpace }}>
                {entry.date && (
                  <p className="mb-2 uppercase" style={css(s.date)}>
                    {entry.date}
                  </p>
                )}
                {entry.title && (
                  <h3 className="font-normal leading-tight" style={css(s.title)}>
                    {entry.title}
                  </h3>
                )}
              </div>
            )}
            <div className="flex flex-col" style={{ gap: s.pictureSpace }}>
              {entry.pictures.map((picture, j) => {
                const shown = picture.imageId ? media(picture.imageId) : null;
                if (!shown && !picture.caption && !picture.text) return null;
                return (
                  <div
                    key={j}
                    className={`flex flex-col gap-[var(--entry-gap)] ${
                      shown ? "site:grid site:grid-cols-[var(--entry-picture)_1fr] site:items-start" : ""
                    }`}
                  >
                    {shown && (
                      <div className="min-w-0">
                        <div
                          className="relative w-full overflow-hidden rounded-sm"
                          style={{ aspectRatio: pictureShapeRatio(s.shape) }}
                        >
                          <SectionMediaView media={shown} alt={entry.title} fill />
                        </div>
                        {picture.caption && (
                          <p className="mt-1.5" style={css(s.caption)}>
                            {picture.caption}
                          </p>
                        )}
                      </div>
                    )}
                    {picture.text && (
                      <p
                        className="min-w-0 whitespace-pre-line break-words"
                        style={{ ...css(s.text), lineHeight: 1.8 }}
                      >
                        {picture.text}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
