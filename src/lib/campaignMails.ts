// A campaign's mails (2026-10-08, from Craig's mockup): the principal
// mail, up to 2 alternatives and at most one follow-up. Each recipient
// gets the principal mail or one of the alternatives: an alternative
// goes to its share of the audience and the principal mail to the rest.
// The follow-up goes, N days later, to those who did (or didn't) open
// or click. Plain module, not "use server".

export type CampaignMailKind = "PRINCIPAL" | "ALTERNATIVE" | "FOLLOW_UP";

export const MAX_ALTERNATIVES = 2;

export const FOLLOW_UP_CONDITIONS = [
  { value: "NOT_OPENED", label: "Not opened" },
  { value: "OPENED", label: "Opened" },
  { value: "CLICKED", label: "Clicked" },
  { value: "NOT_CLICKED", label: "Not clicked" },
] as const;

export type FollowUpCondition = (typeof FOLLOW_UP_CONDITIONS)[number]["value"];

export function isFollowUpCondition(value: unknown): value is FollowUpCondition {
  return FOLLOW_UP_CONDITIONS.some((c) => c.value === value);
}

export const FOLLOW_UP_DAY_LIMITS = { min: 1, max: 60 } as const;
export const DEFAULT_FOLLOW_UP = { condition: "NOT_OPENED", days: 3 } as const;

// An alternative's share: at least 1%, and together the alternatives
// leave at least 1% for the principal mail.
export const SHARE_LIMITS = { min: 1, max: 99 } as const;

// The starting shares when the number of alternatives changes (as in
// Craig's mockup: one alternative 50%; two, 25% each).
export function defaultShares(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [50];
  return Array.from({ length: count }, () => 25);
}

// What the principal mail gets: whatever the alternatives leave.
export function principalShare(alternativeShares: number[]): number {
  return 100 - alternativeShares.reduce((sum, n) => sum + n, 0);
}

export function cleanFollowUpDays(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_FOLLOW_UP.days;
  return Math.min(FOLLOW_UP_DAY_LIMITS.max, Math.max(FOLLOW_UP_DAY_LIMITS.min, n));
}

// The mail's name in the list: "Principal mail", "Alternative mail 1"…
export function campaignMailLabel(kind: CampaignMailKind, position: number): string {
  if (kind === "PRINCIPAL") return "Principal mail";
  if (kind === "FOLLOW_UP") return "Follow-up mail";
  return `Alternative mail ${position}`;
}

// The order mails are listed in: principal, alternatives, follow-up.
export function campaignMailOrder(mail: { kind: CampaignMailKind; position: number }): number {
  if (mail.kind === "PRINCIPAL") return 0;
  if (mail.kind === "FOLLOW_UP") return 100;
  return mail.position;
}
