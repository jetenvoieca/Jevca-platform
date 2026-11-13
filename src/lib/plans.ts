// Subscriber options (2026-11-09, Craig's request) — see Plan in
// schema.prisma. No database here, so the screens can use it too; the
// actions are in lib/actions/plans.ts.

export type AddOnKey = "ART_MANAGER" | "WEB_MANAGER" | "LOCATIONS" | "ECOMMERCE" | "MAILINGS" | "EXTRA_PAGE_GROUP";

// The add-ons there are, in the order they're listed. `perItem`: charged
// for each one the site has (a quantity), not just on or off.
export const ADD_ONS: { key: AddOnKey; label: string; perItem: boolean }[] = [
  { key: "ART_MANAGER", label: "Art Manager", perItem: false },
  { key: "WEB_MANAGER", label: "Web Manager", perItem: false },
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

// The currencies a plan is priced in (2026-11-13, Craig): each plan and
// add-on has a price in every one; a site pays in one of them.
export const PLAN_CURRENCIES = ["GBP", "EUR", "USD"] as const;
export type PlanCurrency = (typeof PLAN_CURRENCIES)[number];

export function isPlanCurrency(value: unknown): value is PlanCurrency {
  return typeof value === "string" && (PLAN_CURRENCIES as readonly string[]).includes(value);
}

// A price in each currency — decimals, e.g. "19.00".
export type CurrencyPrices = Record<PlanCurrency, string>;

export const NO_PRICES: CurrencyPrices = { GBP: "0.00", EUR: "0.00", USD: "0.00" };

// An add-on a plan offers, in each currency.
export type PlanAddOnPrices = { addOn: AddOnKey; prices: CurrencyPrices };

// An add-on's price in one currency.
export type PlanAddOnPrice = { addOn: AddOnKey; monthlyPrice: string };

export type PlanSummary = {
  id: string;
  name: string;
  // Its price in each currency.
  prices: CurrencyPrices;
  // The products it includes (2026-11-13) — at least one; see Plan in
  // schema.prisma.
  includesWeb: boolean;
  includesArt: boolean;
  groupsIncluded: number;
  pagesPerGroup: number;
  // What it includes, one item a line (shown on the Artist App's Account).
  included: string;
  // The Site Themes it allows, the default first.
  themeIds: string[];
  // The add-ons it offers, in ADD_ONS order.
  addOns: PlanAddOnPrices[];
  // Sites on it (a plan in use can't be deleted).
  siteCount: number;
};

// A plan in one currency — what a site paying in it is offered.
export type PricedPlan = Omit<PlanSummary, "prices" | "addOns"> & {
  currency: PlanCurrency;
  monthlyPrice: string;
  addOns: PlanAddOnPrice[];
};

export function pricePlan(plan: PlanSummary, currency: PlanCurrency): PricedPlan {
  const { prices, addOns, ...rest } = plan;
  return {
    ...rest,
    currency,
    monthlyPrice: prices[currency],
    addOns: addOns.map((a) => ({ addOn: a.addOn, monthlyPrice: a.prices[currency] })),
  };
}

// An add-on as chosen (on the Plan card or the Account).
export type SiteAddOnChoice = { addOn: AddOnKey; quantity: number };

// An add-on a site has, at the price it took it at (decimal, e.g. "5.00",
// each) — kept when the plan's price for it later changes.
export type SiteAddOnRow = SiteAddOnChoice & { monthlyPrice: string };

// A site's subscription: its Plan, Site Theme, what it pays for the plan
// (the plan's price when it joined, or its own) and its add-ons.
export type SiteSubscription = {
  planId: string | null;
  // The currency it pays in (2026-11-13) — set with its plan.
  currency: PlanCurrency | null;
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

// The products (2026-11-13): an add-on for a product the plan includes
// isn't offered; Locations / Consignments belongs to Art Manager — only
// with it, in the plan or added.
type PlanProducts = { includesWeb: boolean; includesArt: boolean };

export function offeredAddOns<T extends { addOn: AddOnKey }>(plan: PlanProducts, addOns: readonly T[]): T[] {
  return addOns.filter(
    (a) => !(a.addOn === "ART_MANAGER" && plan.includesArt) && !(a.addOn === "WEB_MANAGER" && plan.includesWeb),
  );
}

// With the website (Web Manager): in the plan or added.
export function hasWebManager(plan: PlanProducts, addOns: { addOn: AddOnKey }[]): boolean {
  return plan.includesWeb || addOns.some((a) => a.addOn === "WEB_MANAGER");
}

export function hasArtManager(plan: PlanProducts, addOns: { addOn: AddOnKey }[]): boolean {
  return plan.includesArt || addOns.some((a) => a.addOn === "ART_MANAGER");
}

// Add-ons chosen for `plan`, checked: only those it offers, each once; a
// quantity only for those charged each (otherwise 1).
export function checkAddOns(
  plan: PlanProducts & { addOns: { addOn: AddOnKey }[] },
  input: SiteAddOnChoice[],
): { addOns: SiteAddOnChoice[] } | { error: string } {
  const offered = new Set(offeredAddOns(plan, plan.addOns).map((a) => a.addOn));
  if (input.some((a) => a.addOn === "LOCATIONS") && !hasArtManager(plan, input)) {
    return { error: "Locations / Consignments comes with Art Manager." };
  }
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
  includesWeb: boolean;
  includesArt: boolean;
  groupsIncluded: number;
  pagesPerGroup: number;
  included: string[];
  themeName: string | null;
  addOns: PlanAddOnPrice[];
};

export type SiteAccount = {
  plan: SiteAccountPlan | null;
  // What the site's add-ons include (AddOnInfo), those with a list, in
  // ADD_ONS order — shown under the plan's own list.
  addOnsIncluded: { addOn: AddOnKey; label: string; included: string[] }[];
  addOns: SiteAddOnRow[];
};

// What a site's Plan and add-ons give it in the Artist App (2026-11-09):
// the website (Web Manager — its pages, publishing; 2026-11-13) and Art
// Manager, each from the plan or added;
// pictures from the device, or with Art Manager from the Media Catalogue
// too; with Art Manager the Catalogue screen (2026-11-10); the artwork picker's Location and Type filters with Art Manager or
// Locations; and how many pages a group may have (null: no limit) and how
// many groups (the Plan's, plus each Additional group of pages — kept for
// when groups can be added). A site with no Plan works as Portfolio did:
// pictures from the device, no filters, no limits.
export type SiteFeatures = {
  website: boolean;
  picturesFrom: "file" | "both";
  catalogue: boolean;
  pickerFilters: boolean;
  pagesPerGroup: number | null;
  pageGroups: number | null;
};

export function siteFeatures(
  plan: (PlanProducts & { groupsIncluded: number; pagesPerGroup: number }) | null,
  addOns: SiteAddOnChoice[],
): SiteFeatures {
  const has = (key: AddOnKey) => addOns.find((a) => a.addOn === key)?.quantity ?? 0;
  const art = (plan?.includesArt ?? false) || has("ART_MANAGER") > 0;
  return {
    website: !plan || plan.includesWeb || has("WEB_MANAGER") > 0,
    picturesFrom: art ? "both" : "file",
    catalogue: art,
    pickerFilters: art || has("LOCATIONS") > 0,
    pagesPerGroup: plan ? plan.pagesPerGroup : null,
    pageGroups: plan ? plan.groupsIncluded + has("EXTRA_PAGE_GROUP") : null,
  };
}
