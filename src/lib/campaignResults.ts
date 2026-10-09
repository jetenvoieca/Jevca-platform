// A sent campaign's results (2026-10-09, Marketing step 4b), from Craig's
// mockup: per version (the principal mail and its alternatives) how many
// were sent, delivered, opened and clicked, and three rates:
// - Open = opened ÷ delivered
// - Click = clicked ÷ opened
// - Conversion = clicked ÷ sent (Craig's definition, 2026-10-09)
// Opens are only seen when a mail's images load, and Apple Mail loads
// them for every mail — so opens read high, and Conversion, built on
// clicks, is the fair way to compare versions. Plain module.

export type VersionCounts = {
  mailId: string;
  label: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
};

export type VersionRates = { open: number | null; click: number | null; conversion: number | null };

// One colour per version, in order (principal, alternative 1, 2): the
// hues of Craig's mockup, made a little stronger so they stay apart for
// colour-blind readers and on white (checked with a palette validator).
export const VERSION_COLOURS = ["#D27A4C", "#4BA36F", "#6B82CC"];

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

export function versionRates(v: VersionCounts): VersionRates {
  return {
    open: ratio(v.opened, v.delivered),
    click: ratio(v.clicked, v.opened),
    conversion: ratio(v.clicked, v.sent),
  };
}

export function formatPercent(value: number | null): string {
  return value === null ? "–" : `${(value * 100).toFixed(1)}%`;
}

// Which version is ahead on Conversion — but only once the gap to every
// other version is too big to be chance (a two-proportion z-test at 95%,
// with at least MIN_SENT people per version). Until then, no leader.
const MIN_SENT = 30;
const Z_95 = 1.96;

export type Leader = { mailId: string } | { tooEarly: true } | null;

export function leadingVersion(versions: VersionCounts[]): Leader {
  if (versions.length < 2) return null;
  if (versions.some((v) => v.sent < MIN_SENT)) return { tooEarly: true };
  const best = versions.reduce((a, b) => (b.clicked / b.sent > a.clicked / a.sent ? b : a));
  const clear = versions
    .filter((v) => v.mailId !== best.mailId)
    .every((v) => zScore(best, v) >= Z_95);
  return clear ? { mailId: best.mailId } : { tooEarly: true };
}

function zScore(a: VersionCounts, b: VersionCounts): number {
  const pa = a.clicked / a.sent;
  const pb = b.clicked / b.sent;
  const pooled = (a.clicked + b.clicked) / (a.sent + b.sent);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.sent + 1 / b.sent));
  return se > 0 ? (pa - pb) / se : 0;
}

// The two people lists under the chart.
export type PeopleList = "clicked" | "openedNotClicked";

export type ResultPerson = {
  email: string;
  name: string;
  mailId: string;
  language: string;
  // When they clicked (Clicked list) or first opened (the other).
  at: string;
};
