import { db } from "@/lib/db";

// Sites billed from their plan (2026-11-10, sign-up) — see Site's
// billing fields in schema.prisma. Plain server code, called by the
// platform webhook.

// Keeps a site's subscription status as Stripe reports it (active,
// past_due, canceled…). Subscriptions that aren't a site's (billing by
// hand) are left to updatePlatformSubscriptionStatus.
export async function updateSiteSubscriptionStatus(subscriptionId: string, status: string): Promise<void> {
  await db.site.updateMany({
    where: { stripeSubscriptionId: subscriptionId },
    data: { stripeSubscriptionStatus: status },
  });
}
