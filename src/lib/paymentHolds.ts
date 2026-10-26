import { db } from "@/lib/db";
import { abandonPurchase, recordPaymentIntent } from "@/lib/purchases";
import { getStripeClientForSale } from "@/lib/stripe";

// Holds on works while a website visitor pays (2026-10-19, Craig's
// choice — see lib/actions/websitePurchase.ts): starting to pay makes the
// work Sold - Not Paid for HOLD_MINUTES; if no payment has come in by
// then, the sale is cancelled and the work is available again. Run every
// 10 minutes (netlify/functions/release-payment-holds.mts) and, for one
// work, just before a new visitor starts paying for it. Server-only.

export const HOLD_MINUTES = 30;

export function holdEndsAt(now = new Date()): Date {
  return new Date(now.getTime() + HOLD_MINUTES * 60 * 1000);
}

// Releases the holds that have run out — all of them, or one work's.
// Before cancelling a sale its card payment is checked with Stripe: one
// that went through after all is recorded instead, and one still being
// processed is left for the next run. Payments that were never finished
// are cancelled, so they can't go through later.
export async function releaseExpiredHolds(artworkId?: string): Promise<number> {
  const expired = await db.purchase.findMany({
    where: {
      holdUntil: { lt: new Date() },
      status: "ACTIVE",
      payments: { none: {} },
      ...(artworkId ? { artworkId } : {}),
    },
    select: { id: true, stripeMode: true, stripeAccountId: true, stripeCustomerId: true },
  });

  let released = 0;
  for (const sale of expired) {
    try {
      const intents = sale.stripeCustomerId
        ? (
            await getStripeClientForSale(sale).paymentIntents.list({ customer: sale.stripeCustomerId, limit: 10 })
          ).data.filter((i) => i.metadata?.purchaseId === sale.id)
        : [];

      const paid = intents.find((i) => i.status === "succeeded");
      if (paid) {
        await recordPaymentIntent(sale.id, paid.id);
        continue;
      }
      if (intents.some((i) => i.status === "processing")) continue;

      for (const intent of intents) {
        if (intent.status !== "canceled") await getStripeClientForSale(sale).paymentIntents.cancel(intent.id);
      }
      await abandonPurchase(sale.id, "");
      await db.purchase.update({ where: { id: sale.id }, data: { holdUntil: null } });
      released++;
    } catch (err) {
      console.error(`[payment-holds] could not release sale ${sale.id}:`, err);
    }
  }
  return released;
}
