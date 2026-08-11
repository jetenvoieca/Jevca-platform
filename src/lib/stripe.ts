import Stripe from "stripe";

// Per-artist Test/Live isolation (2026-08-09) — one shared Stripe account
// for the whole platform, but each artist's own `stripeMode` decides
// which pair of keys their sales actually use. Nothing here defaults to
// Live; every call site must explicitly pass the artist's resolved mode.
export type StripeMode = "TEST" | "LIVE";

const clients: Partial<Record<StripeMode, Stripe>> = {};

// No apiVersion pinned deliberately — recent stripe-node defaults to the
// account's own configured API version when omitted, which is fine for a
// single-account setup like this one. Revisit and pin explicitly if this
// ever needs to be reproducible across more than one Stripe account.
export function getStripeClient(mode: StripeMode): Stripe {
  const existing = clients[mode];
  if (existing) return existing;

  const key =
    mode === "LIVE" ? process.env.STRIPE_SECRET_KEY_LIVE : process.env.STRIPE_SECRET_KEY_TEST;
  if (!key) {
    throw new Error(
      `Missing STRIPE_SECRET_KEY_${mode} — set it in Netlify before taking a ${mode.toLowerCase()}-mode payment.`
    );
  }
  const client = new Stripe(key);
  clients[mode] = client;
  return client;
}

// The publishable key is not secret, but it still has to match the same
// mode as the secret key used server-side for a given purchase — mixing
// a Live publishable key with a Test payment intent (or vice versa) fails
// outright in Stripe.js, so this is resolved alongside the client, never
// read from a single static NEXT_PUBLIC_ constant (which can only ever
// hold one build-time value, not one per artist).
export function getPublishableKey(mode: StripeMode): string {
  const key =
    mode === "LIVE"
      ? process.env.STRIPE_PUBLISHABLE_KEY_LIVE
      : process.env.STRIPE_PUBLISHABLE_KEY_TEST;
  if (!key) {
    throw new Error(
      `Missing STRIPE_PUBLISHABLE_KEY_${mode} — set it in Netlify before taking a ${mode.toLowerCase()}-mode payment.`
    );
  }
  return key;
}

export function getWebhookSecret(mode: StripeMode): string | undefined {
  return mode === "LIVE" ? process.env.STRIPE_WEBHOOK_SECRET_LIVE : process.env.STRIPE_WEBHOOK_SECRET_TEST;
}

// The base URL Stripe redirects back to after a hosted Checkout payment.
// Set NEXT_PUBLIC_APP_URL in Netlify to the real deployed URL
// (e.g. https://jevca.netlify.app) — falls back to that for local/dev use.
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://jevca.netlify.app";

// Stripe wants amounts as an integer in the currency's smallest unit
// (pence/cents) — GBP and EUR are both 2-decimal currencies, so this is a
// straightforward x100. Revisit if a zero-decimal currency (e.g. JPY) is
// ever needed.
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export function fromMinorUnits(amount: number): number {
  return amount / 100;
}

// Splits a total into `count` instalments of equal size, with any
// rounding remainder absorbed into the final instalment so the parts
// always sum exactly back to the total.
export function splitIntoInstalments(total: number, count: number): number[] {
  const base = Math.round((total / count) * 100) / 100;
  const amounts = Array(count - 1).fill(base);
  const runningTotal = Math.round(base * (count - 1) * 100) / 100;
  const last = Math.round((total - runningTotal) * 100) / 100;
  amounts.push(last);
  return amounts;
}
