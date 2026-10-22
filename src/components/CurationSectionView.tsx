import { sectionIsEmpty, type CurationSectionData } from "@/lib/curationSections";
import type { PageTextStyle } from "@/lib/pageStyleLayout";
import { bodyTextCss } from "@/components/textStyleCss";
import FadeImage from "@/components/FadeImage";

// One curation section as visitors see it (2026-10-06; shared
// 2026-10-07) — in the curation panel on a Canvas page (CurationPanel),
// and in a Block Build page's component it's been put in
// (PagePreview). The Description is plain text; in a page's Header, Text
// or Text grid component it takes that component's font, size, style and
// colour from the page's style (`textStyle`, 2026-10-07 — see
// textStyleCss.ts; `contentWidth`, the page's contents as designed, for
// a text that shrinks). An empty section shows nothing.
export default function CurationSectionView({
  section,
  textStyle,
  contentWidth,
}: {
  section: CurationSectionData;
  textStyle?: PageTextStyle;
  contentWidth?: number;
}) {
  if (sectionIsEmpty(section)) return null;
  const body = textStyle ? bodyTextCss(textStyle, contentWidth) : undefined;

  switch (section.type) {
    case "DESCRIPTION":
      return (
        <p className="whitespace-pre-line break-words text-sm text-neutral-800" style={body}>
          {section.text}
        </p>
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
            <FadeImage key={m.imageId} src={m.url} alt="" className="w-full rounded-md" />
          ))}
        </div>
      );
  }
}
