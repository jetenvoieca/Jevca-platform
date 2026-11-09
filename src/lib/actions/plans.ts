"use server";

import { requireAdmin } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { isCurrency } from "@/lib/currencies";
import {
  ADD_ONS,
  PLAN_LIMITS,
  toPence,
  type AddOnKey,
  type PlanAddOnPrice,
  type PlanSummary,
  type SiteAddOnChoice,
  type SiteSubscription,
} from "@/lib/plans";

// Subscriber options (2026-11-09) — see Plan in schema.prisma and
// lib/plans.ts. Plans are managed by admins under Templates → Plans; a
// site's Plan, Site Theme and add-ons are chosen under Administration →
// Clients.

type Result = { ok: true } | { error: string };

const ADD_ON_ORDER = new Map(ADD_ONS.map((a, i) => [a.key, i]));
const PER_ITEM = new Set(ADD_ONS.filter((a) => a.perItem).map((a) => a.key));

const PLAN_SELECT = {
  id: true,
  name: true,
  monthlyPrice: true,
  currency: true,
  groupsIncluded: true,
  pagesPerGroup: true,
  themes: { orderBy: { position: "asc" }, select: { siteThemeId: true } },
  addOns: { select: { addOn: true, monthlyPrice: true } },
  _count: { select: { sites: true } },
} as const;

type PlanRecord = {
  id: string;
  name: string;
  monthlyPrice: { toFixed: (digits: number) => string };
  currency: string;
  groupsIncluded: number;
  pagesPerGroup: number;
  themes: { siteThemeId: string }[];
  addOns: { addOn: AddOnKey; monthlyPrice: { toFixed: (digits: number) => string } }[];
  _count: { sites: number };
};

function toSummary(p: PlanRecord): PlanSummary {
  return {
    id: p.id,
    name: p.name,
    monthlyPrice: p.monthlyPrice.toFixed(2),
    currency: p.currency,
    groupsIncluded: p.groupsIncluded,
    pagesPerGroup: p.pagesPerGroup,
    themeIds: p.themes.map((t) => t.siteThemeId),
    addOns: p.addOns
      .map((a) => ({ addOn: a.addOn, monthlyPrice: a.monthlyPrice.toFixed(2) }))
      .sort((a, b) => ADD_ON_ORDER.get(a.addOn)! - ADD_ON_ORDER.get(b.addOn)!),
    siteCount: p._count.sites,
  };
}

export async function listPlans(): Promise<PlanSummary[]> {
  await requireAdmin();
  const rows = await db.plan.findMany({ orderBy: { name: "asc" }, select: PLAN_SELECT });
  return rows.map(toSummary);
}

export async function createPlan(nameRaw: string): Promise<{ id: string } | { error: string }> {
  await requireAdmin();
  const name = nameRaw.trim();
  if (!name) return { error: "Give the plan a name." };
  if (await db.plan.findUnique({ where: { name }, select: { id: true } })) {
    return { error: "There's already a plan with that name." };
  }
  return db.plan.create({ data: { name, monthlyPrice: 0 }, select: { id: true } });
}

function inRange(n: number, limits: { min: number; max: number }): boolean {
  return Number.isInteger(n) && n >= limits.min && n <= limits.max;
}

// Saves a plan. Sites on it lose the add-ons it no longer offers, and a
// theme it no longer allows is replaced by its default.
export async function updatePlan(
  id: string,
  input: Omit<PlanSummary, "id" | "siteCount">,
): Promise<Result> {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) return { error: "Give the plan a name." };
  const clash = await db.plan.findFirst({ where: { name, id: { not: id } }, select: { id: true } });
  if (clash) return { error: "There's already a plan with that name." };
  const price = toPence(input.monthlyPrice);
  if (price === null) return { error: "The plan's price couldn't be read." };
  if (!isCurrency(input.currency)) return { error: "That currency isn't offered." };
  if (!inRange(input.groupsIncluded, PLAN_LIMITS.groupsIncluded)) {
    return { error: `Groups of pages included must be ${PLAN_LIMITS.groupsIncluded.min} to ${PLAN_LIMITS.groupsIncluded.max}.` };
  }
  if (!inRange(input.pagesPerGroup, PLAN_LIMITS.pagesPerGroup)) {
    return { error: `Pages in a group must be ${PLAN_LIMITS.pagesPerGroup.min} to ${PLAN_LIMITS.pagesPerGroup.max}.` };
  }

  const themeIds = [...new Set(input.themeIds)];
  const found = await db.siteTheme.count({ where: { id: { in: themeIds } } });
  if (found !== themeIds.length) return { error: "One of those themes wasn't found." };

  const addOns: { addOn: AddOnKey; pence: number }[] = [];
  for (const a of input.addOns as PlanAddOnPrice[]) {
    if (!ADD_ON_ORDER.has(a.addOn) || addOns.some((x) => x.addOn === a.addOn)) continue;
    const pence = toPence(a.monthlyPrice);
    if (pence === null) return { error: "An add-on's price couldn't be read." };
    addOns.push({ addOn: a.addOn, pence });
  }
  const offered = addOns.map((a) => a.addOn);

  const exists = await db.plan.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return { error: "Plan not found." };

  await db.$transaction([
    db.plan.update({
      where: { id },
      data: {
        name,
        monthlyPrice: price / 100,
        currency: input.currency,
        groupsIncluded: input.groupsIncluded,
        pagesPerGroup: input.pagesPerGroup,
      },
    }),
    db.planTheme.deleteMany({ where: { planId: id } }),
    db.planTheme.createMany({ data: themeIds.map((siteThemeId, position) => ({ planId: id, siteThemeId, position })) }),
    db.planAddOn.deleteMany({ where: { planId: id } }),
    db.planAddOn.createMany({
      data: addOns.map((a) => ({ planId: id, addOn: a.addOn, monthlyPrice: a.pence / 100 })),
    }),
    db.siteAddOn.deleteMany({ where: { site: { planId: id }, addOn: { notIn: offered } } }),
    db.site.updateMany({
      where: { planId: id, OR: [{ siteThemeId: null }, { siteThemeId: { notIn: themeIds } }] },
      data: { siteThemeId: themeIds[0] ?? null },
    }),
  ]);
  return { ok: true };
}

export async function deletePlan(id: string): Promise<Result> {
  await requireAdmin();
  const inUse = await db.site.count({ where: { planId: id } });
  if (inUse > 0) return { error: `${inUse === 1 ? "A site is" : `${inUse} sites are`} on this plan — move them first.` };
  await db.plan.deleteMany({ where: { id } });
  return { ok: true };
}

export async function getSiteSubscription(siteId: string): Promise<SiteSubscription> {
  await requireAdmin();
  const site = await db.site.findUniqueOrThrow({
    where: { id: siteId },
    select: {
      planId: true,
      siteThemeId: true,
      monthlyOverride: true,
      addOns: { select: { addOn: true, quantity: true } },
    },
  });
  return {
    planId: site.planId,
    siteThemeId: site.siteThemeId,
    addOns: site.addOns.sort((a, b) => ADD_ON_ORDER.get(a.addOn)! - ADD_ON_ORDER.get(b.addOn)!),
    monthlyOverride: site.monthlyOverride?.toFixed(2) ?? null,
  };
}

// Sets a site's Plan, Site Theme (one the Plan allows), add-ons (those it
// offers) and own monthly price. No plan: none of those either.
export async function setSiteSubscription(siteId: string, input: SiteSubscription): Promise<Result> {
  await requireAdmin();
  const site = await db.site.findUnique({ where: { id: siteId }, select: { id: true } });
  if (!site) return { error: "Site not found." };

  let siteThemeId: string | null = null;
  let overridePence: number | null = null;
  const addOns: SiteAddOnChoice[] = [];
  if (input.planId) {
    if (input.monthlyOverride !== null) {
      overridePence = toPence(input.monthlyOverride);
      if (overridePence === null) return { error: "The site's own price couldn't be read." };
    }
    const plan = await db.plan.findUnique({ where: { id: input.planId }, select: PLAN_SELECT });
    if (!plan) return { error: "That plan wasn't found." };
    const summary = toSummary(plan);
    if (input.siteThemeId && !summary.themeIds.includes(input.siteThemeId)) {
      return { error: "That theme isn't one this plan allows." };
    }
    siteThemeId = input.siteThemeId ?? summary.themeIds[0] ?? null;
    const offered = new Set(summary.addOns.map((a) => a.addOn));
    for (const a of input.addOns) {
      if (!offered.has(a.addOn)) return { error: "That add-on isn't offered on this plan." };
      if (addOns.some((x) => x.addOn === a.addOn)) continue;
      const quantity = PER_ITEM.has(a.addOn) ? a.quantity : 1;
      if (!inRange(quantity, PLAN_LIMITS.quantity)) {
        return { error: `Quantity must be ${PLAN_LIMITS.quantity.min} to ${PLAN_LIMITS.quantity.max}.` };
      }
      addOns.push({ addOn: a.addOn, quantity });
    }
  }

  await db.$transaction([
    db.site.update({
      where: { id: siteId },
      data: {
        planId: input.planId,
        siteThemeId,
        monthlyOverride: overridePence === null ? null : overridePence / 100,
      },
    }),
    db.siteAddOn.deleteMany({ where: { siteId } }),
    db.siteAddOn.createMany({ data: addOns.map((a) => ({ siteId, ...a })) }),
  ]);
  return { ok: true };
}
