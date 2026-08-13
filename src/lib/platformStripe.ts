import Stripe from "stripe";

// The PLATFORM Stripe account — us collecting subscription fees FROM
// artists. Kept entirely separate from lib/stripe.ts (each artist's own
// account, for THEIR buyers) by explicit request (2026-08-13): "a Stripe
// account separate from the artists' one so as to prevent any possibility
// of contamination." Different env var names, different client, never
// imported by anything in lib/stripe.ts or vice versa.

let client: Stripe | null = null;

export function getPlatformStripeClient(): Stripe {
  if (client) return client;
  const key = process.env.PLATFORM_STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Missing PLATFORM_STRIPE_SECRET_KEY — set it in Netlify (this is the platform's own Stripe account, not any artist's)."
    );
  }
  client = new Stripe(key);
  return client;
}

export function getPlatformStripeWebhookSecret(): string | undefined {
  return process.env.PLATFORM_STRIPE_WEBHOOK_SECRET;
}
