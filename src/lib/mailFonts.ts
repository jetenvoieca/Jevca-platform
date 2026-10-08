// The fonts a Mail Template's text components can use (2026-10-08,
// Craig's choice: a small list of fonts email apps show reliably —
// Gmail and Outlook ignore most custom fonts). Each has a fallback list
// so an email app without it still shows something close. Plain module,
// shared by the layout rules, the editor and (later) the email itself.

export const MAIL_FONT_KINDS = ["Sans serif", "Serif", "Monospace"] as const;

export const MAIL_FONTS = [
  { id: "arial", label: "Arial", kind: "Sans serif", stack: "Arial, Helvetica, sans-serif" },
  { id: "helvetica", label: "Helvetica", kind: "Sans serif", stack: "Helvetica, Arial, sans-serif" },
  { id: "verdana", label: "Verdana", kind: "Sans serif", stack: "Verdana, Geneva, sans-serif" },
  { id: "tahoma", label: "Tahoma", kind: "Sans serif", stack: "Tahoma, Geneva, sans-serif" },
  {
    id: "trebuchet-ms",
    label: "Trebuchet MS",
    kind: "Sans serif",
    stack: "'Trebuchet MS', Helvetica, sans-serif",
  },
  { id: "georgia", label: "Georgia", kind: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  {
    id: "times-new-roman",
    label: "Times New Roman",
    kind: "Serif",
    stack: "'Times New Roman', Times, serif",
  },
  {
    id: "courier-new",
    label: "Courier New",
    kind: "Monospace",
    stack: "'Courier New', Courier, monospace",
  },
] as const;

export type MailFontId = (typeof MAIL_FONTS)[number]["id"];

export function isMailFontId(value: unknown): value is MailFontId {
  return MAIL_FONTS.some((f) => f.id === value);
}

export function mailFontStack(id: MailFontId): string {
  return MAIL_FONTS.find((f) => f.id === id)?.stack ?? "Arial, Helvetica, sans-serif";
}
