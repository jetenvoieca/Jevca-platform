// A guide point's words (2026-10-20, Craig's request): the first line
// typed is its soft heading, shown bold; the lines after it are the
// point itself. Shared by the guides' screens and the PDF.
export function splitGuidePoint(text: string): { heading: string; lines: string[] } {
  const all = (text ?? "").split(/\r?\n/).map((l) => l.trim());
  const first = all.findIndex((l) => l !== "");
  if (first === -1) return { heading: "", lines: [] };
  return { heading: all[first], lines: all.slice(first + 1).filter((l) => l !== "") };
}
