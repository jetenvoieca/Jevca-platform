// Subscriber options (2026-11-09, Craig's request) — see Plan in
// schema.prisma. No database here, so the screens can use it too; the
// actions are in lib/actions/plans.ts.

export type AddOnKey = "ART_MANAGER" | "LOCATIONS" | "ECOMMERCE" | "MAILINGS" | "EXTRA_PAGE_GROUP";

// The add-ons there are, in the order they're listed. `perItem`: charged
// for each one the site has (a quantity), not just on or off.
export const ADD_ONS: { key: AddOnKey; label: string; perItem: boolean }[] = [
  { key: "ART_MANAGER", label: "Art Manager", perItem: false },
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

// A site's subscription: its Plan, Site Theme and add-ons, and its own
// price for the plan if it has one (a decimal, e.g. "15.00"; replaces the
// plan's price — add-ons are still added).
export type SiteSubscription = {
  planId: string | null;
  siteThemeId: string | null;
  addOns: SiteAddOnChoice[];
  monthlyOverride: string | null;
};

// A decimal amount ("19.00", "5") in pence, or null if it isn't one.
export function toPence(value: string): number | null {
  const v = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const [whole, frac = ""] = v.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

// What a site pays a month on `plan` with `addOns`, in pence: the plan's
// price, or the site's own price for it (`monthlyOverride`), plus its
// add-ons — those the plan doesn't offer count for nothing.
export function monthlyTotalPence(
  plan: PlanSummary,
  addOns: SiteAddOnChoice[],
  monthlyOverride: string | null,
): number {
  const prices = new Map(plan.addOns.map((a) => [a.addOn, toPence(a.monthlyPrice) ?? 0]));
  return addOns.reduce(
    (sum, a) => sum + (prices.get(a.addOn) ?? 0) * a.quantity,
    toPence(monthlyOverride ?? plan.monthlyPrice) ?? 0,
  );
}

// What a site's Plan and add-ons give it in the Artist App (2026-11-09):
// pictures from the device, or with Art Manager from the Media Catalogue
// too; the artwork picker's Location and Type filters with Art Manager or
// Locations; and how many pages a group may have (null: no limit) and how
// many groups (the Plan's, plus each Additional group of pages — kept for
// when groups can be added). A site with no Plan works as Portfolio did:
// pictures from the device, no filters, no limits.
export type SiteFeatures = {
  picturesFrom: "file" | "both";
  pickerFilters: boolean;
  pagesPerGroup: number | null;
  pageGroups: number | null;
};

export function siteFeatures(
  plan: { groupsIncluded: number; pagesPerGroup: number } | null,
  addOns: SiteAddOnChoice[],
): SiteFeatures {
  const has = (key: AddOnKey) => addOns.find((a) => a.addOn === key)?.quantity ?? 0;
  return {
    picturesFrom: has("ART_MANAGER") ? "both" : "file",
    pickerFilters: has("ART_MANAGER") > 0 || has("LOCATIONS") > 0,
    pagesPerGroup: plan ? plan.pagesPerGroup : null,
    pageGroups: plan ? plan.groupsIncluded + has("EXTRA_PAGE_GROUP") : null,
  };
}
