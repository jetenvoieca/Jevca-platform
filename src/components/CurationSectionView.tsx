import { sectionIsEmpty, type CurationSectionData } from "@/lib/curationSections";
import type { PageTextStyle } from "@/lib/pageStyleLayout";
import { bodyTextCss, headingTextCss } from "@/components/textStyleCss";

// One curation section as visitors see it (2026-10-06; shared
// 2026-10-07) — in the curation panel on a Canvas page (CurationPanel),
// and in a Block Build page's component it's been put in
// (PagePreview). Text sections are plain text; in a page's Header, Text
// or Text grid component they take that component's font, size, style
// and colour from the page's style (`textStyle`, 2026-10-07 — see
// textStyleCss.ts). An empty section shows nothing.
export default function CurationSectionView({
  section,
  textStyle,
}: {
  section: CurationSectionData;
  textStyle?: PageTextStyle;
}) {
  if (sectionIsEmpty(section)) return null;
  const body = textStyle ? bodyTextCss(textStyle) : undefined;
  const heading = textStyle ? headingTextCss(textStyle) : undefined;

  switch (section.type) {
    case "TAGLINE":
      return (
        <p className="text-center text-base italic text-neutral-700" style={body}>
          {section.text}
        </p>
      );

    case "DESCRIPTION":
      return (
        <p className="whitespace-pre-line break-words text-sm text-neutral-800" style={body}>
          {section.text}
        </p>
      );

    case "TEXT":
      return (
        <div>
          {section.heading && (
            <h3 className="mb-1 text-base font-medium text-neutral-900" style={heading}>
              {section.heading}
            </h3>
          )}
          {section.text && (
            <p className="whitespace-pre-line break-words text-sm text-neutral-800" style={body}>
              {section.text}
            </p>
          )}
        </div>
      );

    case "VIDEO": {
      const video = section.media[0];
      return (
        <video
          src={video.url}
          poster={video.posterUrl ?? undefined}
          controls
          className="w-full rounded-md bg-black"
        />
      );
    }

    case "IMAGES":
      return (
        <div className="flex flex-col gap-2">
          {section.media.map((m) => (
            <img key={m.imageId} src={m.url} alt="" className="w-full rounded-md" />
          ))}
        </div>
      );
  }
}
