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
  included: { maxLength: 2000 },
  groupsIncluded: { min: 1, max: 20 },
  pagesPerGroup: { min: 1, max: 100 },
  // Extra page groups a site can have.
  quantity: { min: 1, max: 20 },
} as const;

// Each add-on's place in ADD_ONS, for keeping lists in that order.
export const ADD_ON_ORDER = new Map(ADD_ONS.map((a, i) => [a.key, i]));
const PER_ITEM = new Set(ADD_ONS.filter((a) => a.perItem).map((a) => a.key));

export function inRange(n: number, limits: { min: number; max: number }): boolean {
  return Number.isInteger(n) && n >= limits.min && n <= limits.max;
}

export type PlanAddOnPrice = { addOn: AddOnKey; monthlyPrice: string };

export type PlanSummary = {
  id: string;
  name: string;
  // Decimal, e.g. "19.00".
  monthlyPrice: string;
  currency: string;
  groupsIncluded: number;
  pagesPerGroup: number;
  // What it includes, one item a line (shown on the Artist App's Account).
  included: string;
  // The Site Themes it allows, the default first.
  themeIds: string[];
  // The add-ons it offers, in ADD_ONS order.
  addOns: PlanAddOnPrice[];
  // Sites on it (a plan in use can't be deleted).
  siteCount: number;
};

// An add-on as chosen (on the Plan card or the Account).
export type SiteAddOnChoice = { addOn: AddOnKey; quantity: number };

// An add-on a site has, at the price it took it at (decimal, e.g. "5.00",
// each) — kept when the plan's price for it later changes.
export type SiteAddOnRow = SiteAddOnChoice & { monthlyPrice: string };

// A site's subscription: its Plan, Site Theme, what it pays for the plan
// (the plan's price when it joined, or its own) and its add-ons.
export type SiteSubscription = {
  planId: string | null;
  siteThemeId: string | null;
  planPrice: string | null;
  addOns: SiteAddOnRow[];
};

// A decimal amount ("19.00", "5") in pence, or null if it isn't one.
export function toPence(value: string): number | null {
  const v = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const [whole, frac = ""] = v.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

// Add-ons chosen for `plan`, checked: only those it offers, each once; a
// quantity only for those charged each (otherwise 1).
export function checkAddOns(
  plan: { addOns: PlanAddOnPrice[] },
  input: SiteAddOnChoice[],
): { addOns: SiteAddOnChoice[] } | { error: string } {
  const offered = new Set(plan.addOns.map((a) => a.addOn));
  const addOns: SiteAddOnChoice[] = [];
  for (const a of input) {
    if (!offered.has(a.addOn)) return { error: "That add-on isn't offered on this plan." };
    if (addOns.some((x) => x.addOn === a.addOn)) continue;
    const quantity = PER_ITEM.has(a.addOn) ? a.quantity : 1;
    if (!inRange(quantity, PLAN_LIMITS.quantity)) {
      return { error: `Quantity must be ${PLAN_LIMITS.quantity.min} to ${PLAN_LIMITS.quantity.max}.` };
    }
    addOns.push({ addOn: a.addOn, quantity });
  }
  return { addOns };
}

// Chosen add-ons with their prices: those the site already has at the
// price it took them at (`kept`), new ones at the plan's price now.
export function priceAddOns(
  choices: SiteAddOnChoice[],
  kept: SiteAddOnRow[],
  planAddOns: PlanAddOnPrice[],
): SiteAddOnRow[] {
  return choices.map((c) => ({
    ...c,
    monthlyPrice:
      kept.find((k) => k.addOn === c.addOn)?.monthlyPrice ??
      planAddOns.find((a) => a.addOn === c.addOn)?.monthlyPrice ??
      "0.00",
  }));
}

// What a site pays a month, in pence: its price for the plan plus each
// add-on at its price, times how many.
export function monthlyTotalPence(planPrice: string, addOns: SiteAddOnRow[]): number {
  return addOns.reduce((sum, a) => sum + (toPence(a.monthlyPrice) ?? 0) * a.quantity, toPence(planPrice) ?? 0);
}

// A site's plan as the Artist App's Account shows it (2026-11-10): what
// the site pays for it, what it includes, the theme the site uses, and the
// add-ons it offers at their prices now, with those the site has at the
// prices it took them at.
export type SiteAccountPlan = {
  name: string;
  monthlyPrice: string;
  currency: string;
  groupsIncluded: number;
  pagesPerGroup: number;
  included: string[];
  themeName: string | null;
  addOns: PlanAddOnPrice[];
};

export type SiteAccount = {
  plan: SiteAccountPlan | null;
  addOns: SiteAddOnRow[];
};

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
