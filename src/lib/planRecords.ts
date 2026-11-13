import { db } from "@/lib/db";
import { ADD_ON_ORDER, type AddOnKey, type PlanSummary } from "@/lib/plans";

// Reading plans from the database (2026-11-10) — shared by the plan and
// sign-up actions. Plain server code, not an action: callers check access.

export const PLAN_SELECT = {
  id: true,
  name: true,
  monthlyPrice: true,
  currency: true,
  includesWeb: true,
  includesArt: true,
  groupsIncluded: true,
  pagesPerGroup: true,
  included: true,
  themes: { orderBy: { position: "asc" }, select: { siteThemeId: true } },
  addOns: { select: { addOn: true, monthlyPrice: true } },
  _count: { select: { sites: true } },
} as const;

type PlanRecord = {
  id: string;
  name: string;
  monthlyPrice: { toFixed: (digits: number) => string };
  currency: string;
  includesWeb: boolean;
  includesArt: boolean;
  groupsIncluded: number;
  pagesPerGroup: number;
  included: string;
  themes: { siteThemeId: string }[];
  addOns: { addOn: AddOnKey; monthlyPrice: { toFixed: (digits: number) => string } }[];
  _count: { sites: number };
};

export function toPlanSummary(p: PlanRecord): PlanSummary {
  return {
    id: p.id,
    name: p.name,
    monthlyPrice: p.monthlyPrice.toFixed(2),
    currency: p.currency,
    includesWeb: p.includesWeb,
    includesArt: p.includesArt,
    groupsIncluded: p.groupsIncluded,
    pagesPerGroup: p.pagesPerGroup,
    included: p.included,
    themeIds: p.themes.map((t) => t.siteThemeId),
    addOns: p.addOns
      .map((a) => ({ addOn: a.addOn, monthlyPrice: a.monthlyPrice.toFixed(2) }))
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
