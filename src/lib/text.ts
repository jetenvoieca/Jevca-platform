// Capitalises the first letter of every paragraph (2026-09-20) — i.e.
// of every line, so each paragraph typed on its own line starts with a
// capital. Only the first letter of a line is touched: the rest of the
// text is left exactly as written. A line whose first character isn't a
// letter is left alone — so numbers and quoted-reply lines ("> ...") are
// unchanged.
//
// Used both on what gets typed (task descriptions, new messages, replies
// — as they're saved or sent) and on what's displayed in the Inbox's
// lists and alerts.
export function capitaliseParagraphs(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .split("\n")
    .map((line) => {
      const i = line.search(/\S/);
      if (i === -1) return line;
      const first = line[i];
      const upper = first.toUpperCase();
      return upper === first ? line : line.slice(0, i) + upper + line.slice(i + 1);
    })
    .join("\n");
}
