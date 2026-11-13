import { db } from "@/lib/db";
import { ADD_ON_ORDER, type SiteAddOnRow } from "@/lib/plans";

// A sign-up link as its page shows it (2026-11-10) — see SignupLink in
// schema.prisma. Plain server code: the sign-up pages are public, the
// link's token being what lets them in.

export type SignupOffer = {
  linkId: string;
  planName: string;
  included: string[];
  currency: string;
  planPrice: string;
  addOns: SiteAddOnRow[];
  name: string | null;
  email: string | null;
};

export type SignupLinkState =
  | { state: "MISSING" }
  | { state: "EXPIRED" }
  | { state: "COMPLETED" }
  | { state: "OPEN"; offer: SignupOffer };

const OFFER_SELECT = {
  id: true,
  planPrice: true,
  currency: true,
  name: true,
  email: true,
  expiresAt: true,
  openedAt: true,
  completedAt: true,
  plan: { select: { name: true, included: true } },
  addOns: { select: { addOn: true, quantity: true, monthlyPrice: true } },
} as const;

// Where a link has got to, with its offer while it can still be used.
export async function readSignupLink(token: string): Promise<SignupLinkState> {
  const link = await db.signupLink.findUnique({ where: { token }, select: OFFER_SELECT });
  if (!link) return { state: "MISSING" };
  if (link.completedAt) return { state: "COMPLETED" };
  if (link.expiresAt <= new Date()) return { state: "EXPIRED" };
  return {
    state: "OPEN",
    offer: {
      linkId: link.id,
      planName: link.plan.name,
      included: link.plan.included ? link.plan.included.split("\n") : [],
      currency: link.currency,
      planPrice: link.planPrice.toFixed(2),
      addOns: link.addOns
        .map((a) => ({ addOn: a.addOn, quantity: a.quantity, monthlyPrice: a.monthlyPrice.toFixed(2) }))
        .sort((a, b) => ADD_ON_ORDER.get(a.addOn)! - ADD_ON_ORDER.get(b.addOn)!),
      name: link.name,
      email: link.email,
    },
  };
}

// Notes the first time a link is opened (shown as "Started").
export async function markSignupLinkOpened(linkId: string): Promise<void> {
  await db.signupLink.updateMany({ where: { id: linkId, openedAt: null }, data: { openedAt: new Date() } });
}
