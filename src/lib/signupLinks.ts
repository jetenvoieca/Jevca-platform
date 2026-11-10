import type { SiteAddOnRow } from "@/lib/plans";

// Sign-up links (2026-11-10, Craig's request) — see SignupLink in
// schema.prisma. No database here, so the screens can use it too; the
// actions are in lib/actions/signupLinks.ts.

export const SIGNUP_LINK_LIMITS = {
  // Days a new link lasts.
  expiryDays: { min: 1, max: 365, default: 30 },
} as const;

// Not opened → opened (started) → completed; expired once past its date
// without being completed.
export type SignupLinkStatus = "NOT_OPENED" | "OPENED" | "COMPLETED" | "EXPIRED";

export const SIGNUP_LINK_STATUS_LABEL: Record<SignupLinkStatus, string> = {
  NOT_OPENED: "Not opened",
  OPENED: "Started",
  COMPLETED: "Signed up",
  EXPIRED: "Expired",
};

export function signupLinkStatus(
  link: { openedAt: string | null; completedAt: string | null; expiresAt: string },
  now: Date,
): SignupLinkStatus {
  if (link.completedAt) return "COMPLETED";
  if (new Date(link.expiresAt) <= now) return "EXPIRED";
  return link.openedAt ? "OPENED" : "NOT_OPENED";
}

// Where a link opens, from the site's own address.
export function signupLinkPath(token: string): string {
  return `/signup/${token}`;
}

export type SignupLinkRow = {
  id: string;
  token: string;
  planName: string;
  themeName: string;
  currency: string;
  planPrice: string;
  addOns: SiteAddOnRow[];
  name: string | null;
  email: string | null;
  // ISO dates.
  createdAt: string;
  expiresAt: string;
  openedAt: string | null;
  completedAt: string | null;
  // The site made, once signed up.
  siteId: string | null;
  siteName: string | null;
};
