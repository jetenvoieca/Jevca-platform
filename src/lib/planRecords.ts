import { db } from "@/lib/db";
import {
  ADD_ON_ORDER,
  NO_PRICES,
  isPlanCurrency,
  type AddOnKey,
  type CurrencyPrices,
  type PlanSummary,
} from "@/lib/plans";

// Reading plans from the database (2026-11-10) — shared by the plan and
// sign-up actions. Plain server code, not an action: callers check access.

export const PLAN_SELECT = {
  id: true,
  name: true,
  includesWeb: true,
  includesArt: true,
  includesMarketing: true,
  includesConcierge: true,
  groupsIncluded: true,
  pagesPerGroup: true,
  included: true,
  prices: { select: { currency: true, monthlyPrice: true } },
  themes: { orderBy: { position: "asc" }, select: { siteThemeId: true } },
  addOns: { select: { addOn: true, currency: true, monthlyPrice: true } },
  _count: { select: { sites: true } },
} as const;

type Money = { toFixed: (digits: number) => string };

type PlanRecord = {
  id: string;
  name: string;
  includesWeb: boolean;
  includesArt: boolean;
  includesMarketing: boolean;
  includesConcierge: boolean;
  groupsIncluded: number;
  pagesPerGroup: number;
  included: string;
  prices: { currency: string; monthlyPrice: Money }[];
  themes: { siteThemeId: string }[];
  addOns: { addOn: AddOnKey; currency: string; monthlyPrice: Money }[];
  _count: { sites: number };
};

// Rows of prices by currency as a price in each (none kept: 0.00).
function pricesOf(rows: { currency: string; monthlyPrice: Money }[]): CurrencyPrices {
  const prices = { ...NO_PRICES };
  for (const r of rows) if (isPlanCurrency(r.currency)) prices[r.currency] = r.monthlyPrice.toFixed(2);
  return prices;
}

export function toPlanSummary(p: PlanRecord): PlanSummary {
  const addOnKeys = [...new Set(p.addOns.map((a) => a.addOn))];
  return {
    id: p.id,
    name: p.name,
    prices: pricesOf(p.prices),
    includesWeb: p.includesWeb,
    includesArt: p.includesArt,
    includesMarketing: p.includesMarketing,
    includesConcierge: p.includesConcierge,
    groupsIncluded: p.groupsIncluded,
    pagesPerGroup: p.pagesPerGroup,
    included: p.included,
    themeIds: p.themes.map((t) => t.siteThemeId),
    addOns: addOnKeys
      .map((addOn) => ({ addOn, prices: pricesOf(p.addOns.filter((a) => a.addOn === addOn)) }))
      .sort((a, b) => ADD_ON_ORDER.get(a.addOn)! - ADD_ON_ORDER.get(b.addOn)!),
    siteCount: p._count.sites,
  };
}

export async function readPlan(id: string): Promise<PlanSummary | null> {
  const row = await db.plan.findUnique({ where: { id }, select: PLAN_SELECT });
  return row ? toPlanSummary(row) : null;
}

export async function readPlans(): Promise<PlanSummary[]> {
  const rows = await db.plan.findMany({ orderBy: { name: "asc" }, select: PLAN_SELECT });
  return rows.map(toPlanSummary);
}
