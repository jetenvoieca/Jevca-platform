"use server";

import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { readPlan } from "@/lib/planRecords";
import {
  ADD_ON_ORDER,
  checkAddOns,
  inRange,
  isPlanCurrency,
  priceAddOns,
  pricePlan,
  toPence,
  type PlanCurrency,
  type SiteAddOnChoice,
} from "@/lib/plans";
import { SIGNUP_LINK_LIMITS, type SignupLinkRow } from "@/lib/signupLinks";

// Administration → Sign-ups (2026-11-10, Craig's request) — see
// SignupLink in schema.prisma and lib/signupLinks.ts. Admin only.

type Result<T = { ok: true }> = T | { error: string };

const LINK_SELECT = {
  id: true,
  token: true,
  planPrice: true,
  currency: true,
  name: true,
  email: true,
  createdAt: true,
  expiresAt: true,
  openedAt: true,
  completedAt: true,
  plan: { select: { name: true } },
  siteTheme: { select: { name: true } },
  site: { select: { id: true, name: true } },
  addOns: { select: { addOn: true, quantity: true, monthlyPrice: true } },
} as const;

export async function listSignupLinks(): Promise<SignupLinkRow[]> {
  await requireAdmin();
  const rows = await db.signupLink.findMany({ orderBy: { createdAt: "desc" }, select: LINK_SELECT });
  return rows.map((r) => ({
    id: r.id,
    token: r.token,
    planName: r.plan.name,
    themeName: r.siteTheme.name,
    currency: r.currency,
    planPrice: r.planPrice.toFixed(2),
    addOns: r.addOns
      .map((a) => ({ addOn: a.addOn, quantity: a.quantity, monthlyPrice: a.monthlyPrice.toFixed(2) }))
      .sort((a, b) => ADD_ON_ORDER.get(a.addOn)! - ADD_ON_ORDER.get(b.addOn)!),
    name: r.name,
    email: r.email,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    openedAt: r.openedAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    siteId: r.site?.id ?? null,
    siteName: r.site?.name ?? null,
  }));
}

export type NewSignupLink = {
  planId: string;
  siteThemeId: string;
  // The currency the offer is in (2026-11-13).
  currency: PlanCurrency;
  // Blank: the plan's price now.
  planPrice: string;
  addOns: SiteAddOnChoice[];
  name: string;
  email: string;
  expiryDays: number;
};

// A new link: the offer is fixed as made — add-ons at the plan's prices
// now. Returns its token.
export async function createSignupLink(input: NewSignupLink): Promise<Result<{ token: string }>> {
  await requireAdmin();
  const found = await readPlan(input.planId);
  if (!found) return { error: "That plan wasn't found." };
  if (!isPlanCurrency(input.currency)) return { error: "Choose the currency of the offer." };
  const plan = pricePlan(found, input.currency);
  if (!plan.themeIds.includes(input.siteThemeId)) return { error: "That theme isn't one this plan allows." };
  const planPence = toPence(input.planPrice.trim() || plan.monthlyPrice);
  if (planPence === null) return { error: "The price for the plan couldn't be read." };
  const checked = checkAddOns(plan, input.addOns);
  if ("error" in checked) return checked;
  if (!inRange(input.expiryDays, SIGNUP_LINK_LIMITS.expiryDays)) {
    return {
      error: `A link lasts ${SIGNUP_LINK_LIMITS.expiryDays.min} to ${SIGNUP_LINK_LIMITS.expiryDays.max} days.`,
    };
  }
  const email = input.email.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email doesn't look right." };

  const token = randomBytes(24).toString("base64url");
  await db.signupLink.create({
    data: {
      token,
      planId: plan.id,
      siteThemeId: input.siteThemeId,
      planPrice: planPence / 100,
      currency: input.currency,
      name: input.name.trim() || null,
      email: email || null,
      expiresAt: new Date(Date.now() + input.expiryDays * 24 * 60 * 60 * 1000),
      addOns: {
        create: priceAddOns(checked.addOns, [], plan.addOns).map((a) => ({
          addOn: a.addOn,
          quantity: a.quantity,
          monthlyPrice: toPence(a.monthlyPrice)! / 100,
        })),
      },
    },
  });
  return { token };
}

// Deletes a link not yet signed up with — it stops working at once. A
// signed-up link stays as the record of where the site came from.
export async function deleteSignupLink(id: string): Promise<Result> {
  await requireAdmin();
  const { count } = await db.signupLink.deleteMany({ where: { id, completedAt: null } });
  if (count === 0) return { error: "A link that's been signed up with can't be deleted." };
  return { ok: true };
}
