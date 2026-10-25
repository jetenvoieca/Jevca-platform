import type { PageHeadingSettings } from "@/lib/pageStyleLayout";
import type { HeadingText } from "@/lib/pageHeading";
import { bodyTextCss } from "@/components/textStyleCss";

// A Page heading on a page (2026-10-25, the ISYT sites — see
// PageHeadingSettings and lib/pageHeading.ts): the site's name over the
// page's name, each in its look, with the line under them if set. Sizes
// shrink with the page (bodyTextCss, `contentWidth` = the page's contents
// as designed).
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
          {lines.page}
        </h1>
      )}
    </div>
  );
}
