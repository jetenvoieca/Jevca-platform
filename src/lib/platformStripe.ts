import Stripe from "stripe";
import type { StripeMode } from "@/lib/stripe";

// The PLATFORM Stripe account — us collecting subscription fees FROM
// artists. Kept entirely separate from lib/stripe.ts (each artist's own
// account, for THEIR buyers) by explicit request (2026-08-13): "a Stripe
// account separate from the artists' one so as to prevent any possibility
// of contamination." Different env var names, different client, never
// imported by anything in lib/stripe.ts or vice versa (bar the shared
// StripeMode type).
//
// Test and Live (2026-11-10, for sign-ups): PLATFORM_STRIPE_SECRET_KEY is
// the Live key (as it always was) and PLATFORM_STRIPE_SECRET_KEY_TEST the
// Test one; likewise PLATFORM_STRIPE_WEBHOOK_SECRET (Live) and
// PLATFORM_STRIPE_WEBHOOK_SECRET_TEST. Every call site passes a mode.

const KEY_VAR: Record<StripeMode, string> = {
  LIVE: "PLATFORM_STRIPE_SECRET_KEY",
  TEST: "PLATFORM_STRIPE_SECRET_KEY_TEST",
};

const clients = new Map<StripeMode, Stripe>();

export function getPlatformStripeClient(mode: StripeMode): Stripe {
  const cached = clients.get(mode);
  if (cached) return cached;
  const key = process.env[KEY_VAR[mode]];
  if (!key) {
    throw new Error(
      `Missing ${KEY_VAR[mode]} — set it in Netlify (this is the platform's own Stripe account, not any artist's).`
    );
  }
  const client = new Stripe(key);
  clients.set(mode, client);
  return client;
}

// Every signing secret the platform webhook accepts, each with its mode —
// the one that verifies an event says which mode it came from.
export function getPlatformStripeWebhookSecrets(): { mode: StripeMode; secret: string }[] {
  const all: { mode: StripeMode; secret: string | undefined }[] = [
    { mode: "LIVE", secret: process.env.PLATFORM_STRIPE_WEBHOOK_SECRET },
    { mode: "TEST", secret: process.env.PLATFORM_STRIPE_WEBHOOK_SECRET_TEST },
  ];
  return all.filter((s): s is { mode: StripeMode; secret: string } => !!s.secret);
}
