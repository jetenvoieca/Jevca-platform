"use server";

import { requireAdmin, requireSiteAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import type { StripeMode } from "@/lib/stripe";
import { PLAN_SELECT, readPlan, readPlans, toPlanSummary } from "@/lib/planRecords";
import {
  ADD_ONS,
  ADD_ON_ORDER,
  PLAN_CURRENCIES,
  PLAN_LIMITS,
  checkAddOns,
  offeredAddOns,
  inRange,
  isPlanCurrency,
  pricePlan,
  toPence,
  type AddOnKey,
  type CurrencyPrices,
  type PlanCurrency,
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

// Prices in each currency in pence, or null if one can't be read.
function pencePrices(prices: CurrencyPrices): Record<PlanCurrency, number> | null {
  const out = {} as Record<PlanCurrency, number>;
  for (const currency of PLAN_CURRENCIES) {
    const pence = toPence(prices[currency] ?? "");
    if (pence === null) return null;
    out[currency] = pence;
  }
  return out;
}

// The currency a site pays in — £ for one set before 2026-11-13 without.
function siteCurrency(value: string | null): PlanCurrency {
  return isPlanCurrency(value) ? value : "GBP";
}

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
  return db.plan.create({
    data: { name, prices: { create: PLAN_CURRENCIES.map((currency) => ({ currency, monthlyPrice: 0 })) } },
    select: { id: true },
  });
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
  // A price in each currency (2026-11-13).
  const prices = pencePrices(input.prices);
  if (!prices) return { error: "The plan's price in each currency couldn't be read." };
  if (!input.includesWeb && !input.includesArt && !input.includesMarketing) {
    return { error: "A plan includes at least one of Web Manager, Art Manager and Marketing Manager." };
  }
  if (!inRange(input.groupsIncluded, PLAN_LIMITS.groupsIncluded)) {
    return { error: `Groups of pages included must be ${PLAN_LIMITS.groupsIncluded.min} to ${PLAN_LIMITS.groupsIncluded.max}.` };
  }
  if (!inRange(input.pagesPerGroup, PLAN_LIMITS.pagesPerGroup)) {
    return { error: `Pages in a group must be ${PLAN_LIMITS.pagesPerGroup.min} to ${PLAN_LIMITS.pagesPerGroup.max}.` };
  }
  const included = cleanLines(input.included);
  if (included.length > PLAN_LIMITS.included.maxLength) {
    return { error: "What's included is too long." };
  }

  const themeIds = [...new Set(input.themeIds)];
  const found = await db.siteTheme.count({ where: { id: { in: themeIds } } });
  if (found !== themeIds.length) return { error: "One of those themes wasn't found." };

  const addOns: { addOn: AddOnKey; pence: Record<PlanCurrency, number> }[] = [];
  // Not an add-on for a product it includes (offeredAddOns).
  for (const a of offeredAddOns(input, input.addOns)) {
    if (!ADD_ON_ORDER.has(a.addOn) || addOns.some((x) => x.addOn === a.addOn)) continue;
    const pence = pencePrices(a.prices);
    if (!pence) return { error: "An add-on's price in each currency couldn't be read." };
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
        includesWeb: input.includesWeb,
        includesArt: input.includesArt,
        includesMarketing: input.includesMarketing,
        groupsIncluded: input.groupsIncluded,
        pagesPerGroup: input.pagesPerGroup,
        included,
      },
    }),
    db.planPrice.deleteMany({ where: { planId: id } }),
    db.planPrice.createMany({
      data: PLAN_CURRENCIES.map((currency) => ({ planId: id, currency, monthlyPrice: prices[currency] / 100 })),
    }),
    db.planTheme.deleteMany({ where: { planId: id } }),
    db.planTheme.createMany({ data: themeIds.map((siteThemeId, position) => ({ planId: id, siteThemeId, position })) }),
    db.planAddOn.deleteMany({ where: { planId: id } }),
    db.planAddOn.createMany({
      data: addOns.flatMap((a) =>
        PLAN_CURRENCIES.map((currency) => ({ planId: id, addOn: a.addOn, currency, monthlyPrice: a.pence[currency] / 100 })),
      ),
    }),
    db.siteAddOn.deleteMany({ where: { site: { planId: id }, addOn: { notIn: offered } } }),
    // Locations / Consignments only with Art Manager.
    ...(input.includesArt
      ? []
      : [
          db.siteAddOn.deleteMany({
            where: { addOn: "LOCATIONS", site: { planId: id, addOns: { none: { addOn: "ART_MANAGER" } } } },
          }),
        ]),
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
    select: {
      planId: true,
      planCurrency: true,
      siteThemeId: true,
      planPrice: true,
      addOns: { select: ADD_ON_ROW_SELECT },
    },
  });
  return {
    planId: site.planId,
    currency: isPlanCurrency(site.planCurrency) ? site.planCurrency : null,
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

// Sets a site's Plan, the currency it pays in (2026-11-13), Site Theme
// (one the Plan allows), what it pays for the plan (blank: the plan's
// price now) and add-ons (those it offers — those it has keep their
// prices, new ones at the plan's price now). A new Plan or currency
// starts afresh at its prices. No plan: none of those either.
export async function setSiteSubscription(
  siteId: string,
  input: Omit<SiteSubscription, "addOns"> & { addOns: SiteAddOnChoice[] },
): Promise<Result> {
  await requireAdmin();
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { planId: true, planCurrency: true, addOns: { select: ADD_ON_ROW_SELECT } },
  });
  if (!site) return { error: "Site not found." };

  let siteThemeId: string | null = null;
  let planPence: number | null = null;
  let currency: PlanCurrency | null = null;
  let addOns: SiteAddOnRow[] = [];
  if (input.planId) {
    const plan = await readPlan(input.planId);
    if (!plan) return { error: "That plan wasn't found." };
    if (!isPlanCurrency(input.currency)) return { error: "Choose the currency the site pays in." };
    currency = input.currency;
    const summary = pricePlan(plan, currency);
    const samePlan = site.planId === input.planId && site.planCurrency === currency;
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
      data: {
        planId: input.planId,
        planCurrency: currency,
        siteThemeId,
        planPrice: planPence === null ? null : planPence / 100,
      },
    }),
    ...writeAddOns(siteId, addOns),
  ]);
  return { ok: true };
}

// What each add-on includes (2026-11-13) — see AddOnInfo.
export async function listAddOnsIncluded(): Promise<Partial<Record<AddOnKey, string>>> {
  await requireAdmin();
  const rows = await db.addOnInfo.findMany({ select: { addOn: true, included: true } });
  return Object.fromEntries(rows.map((r) => [r.addOn, r.included]));
}

export async function setAddOnIncluded(addOn: AddOnKey, text: string): Promise<Result> {
  await requireAdmin();
  if (!ADD_ON_ORDER.has(addOn)) return { error: "That add-on wasn't found." };
  const included = cleanLines(text);
  if (included.length > PLAN_LIMITS.included.maxLength) return { error: "What it includes is too long." };
  await db.addOnInfo.upsert({ where: { addOn }, create: { addOn, included }, update: { included } });
  return { ok: true };
}

// One item a line, blank lines dropped.
function cleanLines(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

// A site's plan for the Artist App's Account (2026-11-10) — see
// SiteAccount in lib/plans.ts.
export async function getSiteAccount(siteId: string): Promise<SiteAccount> {
  await requireSiteAccess(siteId);
  const site = await db.site.findUniqueOrThrow({
    where: { id: siteId },
    select: {
      planPrice: true,
      planCurrency: true,
      siteTheme: { select: { name: true } },
      plan: { select: PLAN_SELECT },
      addOns: { select: ADD_ON_ROW_SELECT },
    },
  });
  const addOns = toAddOnRows(site.addOns);
  const infos = await db.addOnInfo.findMany({
    where: { addOn: { in: addOns.map((a) => a.addOn) } },
    select: { addOn: true, included: true },
  });
  const addOnsIncluded = addOns.flatMap((a) => {
    const text = infos.find((i) => i.addOn === a.addOn)?.included ?? "";
    const label = ADD_ONS.find((o) => o.key === a.addOn)?.label ?? a.addOn;
    return text ? [{ addOn: a.addOn, label, included: text.split("\n") }] : [];
  });
  if (!site.plan) return { plan: null, addOns, addOnsIncluded };
  const plan = pricePlan(toPlanSummary(site.plan), siteCurrency(site.planCurrency));
  return {
    plan: {
      name: plan.name,
      monthlyPrice: site.planPrice?.toFixed(2) ?? plan.monthlyPrice,
      currency: plan.currency,
      includesWeb: plan.includesWeb,
      includesArt: plan.includesArt,
      includesMarketing: plan.includesMarketing,
      groupsIncluded: plan.groupsIncluded,
      pagesPerGroup: plan.pagesPerGroup,
      included: plan.included ? plan.included.split("\n") : [],
      themeName: site.siteTheme?.name ?? null,
      addOns: plan.addOns,
    },
    addOns,
    addOnsIncluded,
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
    select: { planCurrency: true, plan: { select: PLAN_SELECT }, addOns: { select: ADD_ON_ROW_SELECT } },
  });
  if (!site?.plan) return { error: "This site has no plan yet." };
  const summary = pricePlan(toPlanSummary(site.plan), siteCurrency(site.planCurrency));
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
