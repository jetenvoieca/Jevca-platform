import { convert } from "html-to-text";

// The readable body of an inbound email (2026-09-24). Many senders
// (La Poste, most automated/marketing mail) send HTML only, with no
// plain-text part at all — those used to show as blank in the inbox.
// The plain-text part is used whenever the sender provided one;
// otherwise the HTML is converted to plain text here. Images are
// dropped (direct decision — the inbox is text-first; the original
// formatting is still one click away via "Show HTML").
export function readableEmailText(textBody: string | null, htmlBody: string | null): string {
  if (textBody && textBody.trim()) return textBody;
  if (!htmlBody) return "";
  return convert(htmlBody, {
    wordwrap: false,
    selectors: [
      { selector: "img", format: "skip" },
      ...["h1", "h2", "h3", "h4", "h5", "h6"].map((selector) => ({
        selector,
        options: { uppercase: false },
      })),
      { selector: "th", options: { uppercase: false } },
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
    ],
  })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
