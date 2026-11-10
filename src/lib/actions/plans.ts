"use server";

import { requireAdmin, requireSiteAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { isCurrency } from "@/lib/currencies";
import type { StripeMode } from "@/lib/stripe";
import { PLAN_SELECT, readPlan, readPlans, toPlanSummary } from "@/lib/planRecords";
import {
  ADD_ON_ORDER,
  PLAN_LIMITS,
  checkAddOns,
  inRange,
  toPence,
  type AddOnKey,
  type PlanAddOnPrice,
  type PlanSummary,
  priceAddOns,
  type SiteAccount,
  type SiteAddOnChoice,
  type SiteAddOnRow,
  type SiteSubscription,
} from "@/lib/plans";

// Subscriber options (2026-11-09) — see Plan in schema.prisma and
// lib/plans.ts. Plans are managed by admins under Administration → Plans; a
// site's Plan, Site Theme and add-ons are chosen under Administration →
// Clients, and (2026-11-10) its add-ons by the artist too, on the Artist
// App's Account.

type Result = { ok: true } | { error: string };

export async function listPlans(): Promise<PlanSummary[]> {
  await requireAdmin();
  return readPlans();
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

// Saves a plan. Sites on it keep the prices they joined at (new prices
// are for new sign-ups), lose the add-ons it no longer offers, and a theme
// it no longer allows is replaced by its default.
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
  // One item a line, blank lines dropped.
  const included = input.included
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
  if (included.length > PLAN_LIMITS.included.maxLength) {
    return { error: "What's included is too long." };
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
        included,
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

// A site's add-ons as kept, in ADD_ONS order.
const ADD_ON_ROW_SELECT = { addOn: true, quantity: true, monthlyPrice: true } as const;

function toAddOnRows(rows: { addOn: AddOnKey; quantity: number; monthlyPrice: { toFixed: (d: number) => string } }[]): SiteAddOnRow[] {
  return rows
    .map((r) => ({ addOn: r.addOn, quantity: r.quantity, monthlyPrice: r.monthlyPrice.toFixed(2) }))
    .sort((a, b) => ADD_ON_ORDER.get(a.addOn)! - ADD_ON_ORDER.get(b.addOn)!);
}

export async function getSiteSubscription(siteId: string): Promise<SiteSubscription> {
  await requireAdmin();
  const site = await db.site.findUniqueOrThrow({
    where: { id: siteId },
    select: { planId: true, siteThemeId: true, planPrice: true, addOns: { select: ADD_ON_ROW_SELECT } },
  });
  return {
    planId: site.planId,
    siteThemeId: site.siteThemeId,
    planPrice: site.planPrice?.toFixed(2) ?? null,
    addOns: toAddOnRows(site.addOns),
  };
}

// Replaces a site's add-ons with `rows`.
function writeAddOns(siteId: string, rows: SiteAddOnRow[]) {
  return [
    db.siteAddOn.deleteMany({ where: { siteId } }),
    db.siteAddOn.createMany({
      data: rows.map((r) => ({ siteId, addOn: r.addOn, quantity: r.quantity, monthlyPrice: toPence(r.monthlyPrice)! / 100 })),
    }),
  ];
}

// Sets a site's Plan, Site Theme (one the Plan allows), what it pays for
// the plan (blank: the plan's price now) and add-ons (those it offers —
// those it has keep their prices, new ones at the plan's price now). A
// new Plan starts afresh at its prices. No plan: none of those either.
export async function setSiteSubscription(
  siteId: string,
  input: { planId: string | null; siteThemeId: string | null; planPrice: string | null; addOns: SiteAddOnChoice[] },
): Promise<Result> {
  await requireAdmin();
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { planId: true, addOns: { select: ADD_ON_ROW_SELECT } },
  });
  if (!site) return { error: "Site not found." };

  let siteThemeId: string | null = null;
  let planPence: number | null = null;
  let addOns: SiteAddOnRow[] = [];
  if (input.planId) {
    const summary = await readPlan(input.planId);
    if (!summary) return { error: "That plan wasn't found." };
    const samePlan = site.planId === input.planId;
    planPence = toPence(samePlan && input.planPrice?.trim() ? input.planPrice : summary.monthlyPrice);
    if (planPence === null) return { error: "The price for the plan couldn't be read." };
    if (input.siteThemeId && !summary.themeIds.includes(input.siteThemeId)) {
      return { error: "That theme isn't one this plan allows." };
    }
    siteThemeId = input.siteThemeId ?? summary.themeIds[0] ?? null;
    const checked = checkAddOns(summary, input.addOns);
    if ("error" in checked) return checked;
    addOns = priceAddOns(checked.addOns, samePlan ? toAddOnRows(site.addOns) : [], summary.addOns);
  }

  await db.$transaction([
    db.site.update({
      where: { id: siteId },
      data: { planId: input.planId, siteThemeId, planPrice: planPence === null ? null : planPence / 100 },
    }),
    ...writeAddOns(siteId, addOns),
  ]);
  return { ok: true };
}

// A site's plan for the Artist App's Account (2026-11-10) — see
// SiteAccount in lib/plans.ts.
export async function getSiteAccount(siteId: string): Promise<SiteAccount> {
  await requireSiteAccess(siteId);
  const site = await db.site.findUniqueOrThrow({
    where: { id: siteId },
    select: {
      planPrice: true,
      siteTheme: { select: { name: true } },
      plan: { select: PLAN_SELECT },
      addOns: { select: ADD_ON_ROW_SELECT },
    },
  });
  const addOns = toAddOnRows(site.addOns);
  if (!site.plan) return { plan: null, addOns };
  const plan = toPlanSummary(site.plan);
  return {
    plan: {
      name: plan.name,
      monthlyPrice: site.planPrice?.toFixed(2) ?? plan.monthlyPrice,
      currency: plan.currency,
      groupsIncluded: plan.groupsIncluded,
      pagesPerGroup: plan.pagesPerGroup,
      included: plan.included ? plan.included.split("\n") : [],
      themeName: site.siteTheme?.name ?? null,
      addOns: plan.addOns,
    },
    addOns,
  };
}

// The add-ons the artist chose on the Artist App's Account (2026-11-10):
// only those the site's plan offers — those it has keep their prices, new
// ones at the plan's price now. Its plan, theme and price for the plan
// stay as the admin set them.
export async function setSiteAddOns(siteId: string, input: SiteAddOnChoice[]): Promise<Result> {
  await requireSiteAccess(siteId);
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { plan: { select: PLAN_SELECT }, addOns: { select: ADD_ON_ROW_SELECT } },
  });
  if (!site?.plan) return { error: "This site has no plan yet." };
  const summary = toPlanSummary(site.plan);
  const checked = checkAddOns(summary, input);
  if ("error" in checked) return checked;
  await db.$transaction(writeAddOns(siteId, priceAddOns(checked.addOns, toAddOnRows(site.addOns), summary.addOns)));
  return { ok: true };
}

// Whether sign-ups pay in Stripe's Test or Live mode (2026-11-10) — see
// PlatformSettings.signupStripeMode.
export async function getSignupStripeMode(): Promise<StripeMode> {
  await requireAdmin();
  const settings = await db.platformSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
    select: { signupStripeMode: true },
  });
  return settings.signupStripeMode;
}

export async function setSignupStripeMode(mode: StripeMode): Promise<Result> {
  await requireAdmin();
  if (mode !== "TEST" && mode !== "LIVE") return { error: "That mode isn't known." };
  await db.platformSettings.upsert({
    where: { id: "singleton" },
    update: { signupStripeMode: mode },
    create: { id: "singleton", signupStripeMode: mode },
  });
  return { ok: true };
}
