// The one place the app decides how dates and times are shown (2026-09-19)
// — UK format everywhere, dd/mm/yyyy, regardless of where the code runs.
// Previously each screen called toLocaleDateString()/toLocaleString() with
// no locale, which uses whatever the runtime's default is: the browser's
// language when a component renders in the browser, but the server's
// (US English) when the same date was built on the server — so one panel
// could show both 03/08/2026 and 8/3/2026.
//
// Always formatted in UK time as well, so the server and the browser can
// never disagree about which day a timestamp falls on. A date-only value
// like "2026-08-03" is read as midnight UTC, which is still the same day
// in UK time, so it displays correctly too.
//
// Use these instead of toLocaleDateString()/toLocaleString() for anything
// shown to a person. (The invoice PDF is the one deliberate exception —
// it formats to the invoice's own EN/FR language, see invoice.ts.)

const LOCALE = "en-GB";
const TIME_ZONE = "Europe/London";

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIME_ZONE,
});

export type DateInput = Date | string | number;

// Intl's format() throws on an invalid date (unlike toLocaleDateString(),
// which quietly returned "Invalid Date") — so an unreadable value shows
// as blank instead of crashing the page it's on.
function parse(value: DateInput): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// 03/08/2026
export function formatDate(value: DateInput): string {
  const d = parse(value);
  return d ? dateFormat.format(d) : "";
}

// 03/08/2026, 14:05
export function formatDateTime(value: DateInput): string {
  const d = parse(value);
  return d ? dateTimeFormat.format(d) : "";
}
