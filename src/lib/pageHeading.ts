import { MAX_TYPED_TEXT } from "@/lib/pageComponents";

// A Page heading component (2026-10-25, the ISYT sites' "Jilly Sutton
// RSS / Portfolio: Head Sculptures"): two lines that fill themselves in —
// the site's name, and the page's name with the page it sits under in
// front ("Portfolio: Head Sculptures") — either of which can be typed
// over on the page in Arrange (kept as JSON in the component's content
// `text`; blank = filled in). Plain module, shared by the server action,
// Arrange and the page.

// What the heading is filled in from: the site's name, the page's name
// and the name of the page it sits under (null = at the top).
export type HeadingNames = { siteName: string; pageTitle: string; groupTitle: string | null };

export type HeadingText = { name: string; page: string };

export const EMPTY_HEADING_TEXT: HeadingText = { name: "", page: "" };

// The two lines as filled in.
export function automaticHeading(names: HeadingNames): HeadingText {
  return {
    name: names.siteName,
    page: names.groupTitle ? `${names.groupTitle}: ${names.pageTitle}` : names.pageTitle,
  };
}

export function readHeadingText(text: string | null): HeadingText {
  if (!text) return EMPTY_HEADING_TEXT;
  try {
    const value = JSON.parse(text) as Partial<Record<keyof HeadingText, unknown>>;
    const line = (x: unknown) => (typeof x === "string" ? x.slice(0, MAX_TYPED_TEXT) : "");
    return { name: line(value.name), page: line(value.page) };
  } catch {
    return EMPTY_HEADING_TEXT;
  }
}

// What's typed, trimmed — null when nothing is (both lines filled in).
export function writeHeadingText(heading: HeadingText): string | null {
  const clean = { name: heading.name.trim(), page: heading.page.trim() };
  return clean.name || clean.page ? JSON.stringify(clean) : null;
}

// The lines shown: what's typed, else filled in.
export function shownHeading(typed: HeadingText, names: HeadingNames | null): HeadingText {
  const auto = names ? automaticHeading(names) : EMPTY_HEADING_TEXT;
  return { name: typed.name || auto.name, page: typed.page || auto.page };
}
