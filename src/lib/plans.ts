// Subscriber options (2026-11-09, Craig's request) — see Plan in
// schema.prisma. No database here, so the screens can use it too; the
// actions are in lib/actions/plans.ts.

export type AddOnKey = "LOCATIONS" | "ECOMMERCE" | "MAILINGS" | "EXTRA_PAGE_GROUP";

// The add-ons there are, in the order they're listed. `perItem`: charged
// for each one the site has (a quantity), not just on or off.
export const ADD_ONS: { key: AddOnKey; label: string; perItem: boolean }[] = [
  { key: "LOCATIONS", label: "Locations / Consignments", perItem: false },
  { key: "ECOMMERCE", label: "Ecommerce", perItem: false },
  { key: "MAILINGS", label: "Mailings", perItem: false },
  { key: "EXTRA_PAGE_GROUP", label: "Additional group of pages", perItem: true },
];

export const PLAN_LIMITS = {
  groupsIncluded: { min: 1, max: 20 },
  pagesPerGroup: { min: 1, max: 100 },
  // Extra page groups a site can have.
  quantity: { min: 1, max: 20 },
} as const;

export type PlanAddOnPrice = { addOn: AddOnKey; monthlyPrice: string };

export type PlanSummary = {
  id: string;
  name: string;
  // Decimal, e.g. "19.00".
  monthlyPrice: string;
  currency: string;
  groupsIncluded: number;
  pagesPerGroup: number;
  // The Site Themes it allows, the default first.
  themeIds: string[];
  // The add-ons it offers, in ADD_ONS order.
  addOns: PlanAddOnPrice[];
  // Sites on it (a plan in use can't be deleted).
  siteCount: number;
};

export type SiteAddOnChoice = { addOn: AddOnKey; quantity: number };

// A site's subscription: its Plan, Site Theme and add-ons.
export type SiteSubscription = {
  planId: string | null;
  siteThemeId: string | null;
  addOns: SiteAddOnChoice[];
};

// A decimal amount ("19.00", "5") in pence, or null if it isn't one.
export function toPence(value: string): number | null {
  const v = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const [whole, frac = ""] = v.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

// What a site pays a month on `plan` with `addOns`, in pence — add-ons
// the plan doesn't offer count for nothing.
export function monthlyTotalPence(plan: PlanSummary, addOns: SiteAddOnChoice[]): number {
  const prices = new Map(plan.addOns.map((a) => [a.addOn, toPence(a.monthlyPrice) ?? 0]));
  return addOns.reduce(
    (sum, a) => sum + (prices.get(a.addOn) ?? 0) * a.quantity,
    toPence(plan.monthlyPrice) ?? 0,
  );
}
