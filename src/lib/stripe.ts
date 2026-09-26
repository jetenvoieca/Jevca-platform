import Stripe from "stripe";

// Per-artist Test/Live isolation (2026-08-09) — each artist's own
// `stripeMode` decides which pair of Jetenvoieca's keys their sales use.
// Nothing here defaults to Live; every call site passes a mode explicitly.
export type StripeMode = "TEST" | "LIVE";

// Where a sale's Stripe calls go (2026-09-25, Stripe Connect): the mode,
// and the artist's own linked Stripe account (acct_...) — or null for
// Jetenvoieca's own account. Every Purchase stores both (see
// Purchase.stripeAccountId in schema.prisma), so a sale's calls always
// reach the account its Stripe objects actually live in.
export type StripeTarget = { mode: StripeMode; accountId: string | null };

// The same, as stored on a Purchase row.
export type SaleStripeFields = { stripeMode: StripeMode; stripeAccountId: string | null };

const clients = new Map<string, Stripe>();

// A client for one mode and account. Calls on a linked account are made
// with Jetenvoieca's own secret key plus the Stripe-Account header (set
// once here via the client's stripeAccount option), which is how Stripe
// Connect "direct charges" work — no artist's keys are ever stored.
//
// No apiVersion pinned deliberately — stripe-node defaults to the
// platform account's own configured API version when omitted.
export function getStripeClient(target: StripeTarget): Stripe {
  const cacheKey = `${target.mode}:${target.accountId ?? "platform"}`;
  const existing = clients.get(cacheKey);
  if (existing) return existing;

  const key =
    target.mode === "LIVE" ? process.env.STRIPE_SECRET_KEY_LIVE : process.env.STRIPE_SECRET_KEY_TEST;
  if (!key) {
    throw new Error(
      `Missing STRIPE_SECRET_KEY_${target.mode} — set it in Netlify before taking a ${target.mode.toLowerCase()}-mode payment.`
    );
  }
  const client = new Stripe(key, target.accountId ? { stripeAccount: target.accountId } : {});
  clients.set(cacheKey, client);
  return client;
}

// The client for a sale — its own mode and account, as stored on it.
export function getStripeClientForSale(sale: SaleStripeFields): Stripe {
  return getStripeClient({ mode: sale.stripeMode, accountId: sale.stripeAccountId });
}

// The publishable key is not secret, but it still has to match the same
// mode as the secret key used server-side for a given purchase — mixing
// a Live publishable key with a Test payment intent (or vice versa) fails
// outright in Stripe.js, so this is resolved alongside the client, never
// read from a single static NEXT_PUBLIC_ constant (which can only ever
// hold one build-time value, not one per artist). It is always
// Jetenvoieca's own key, even for a sale on an artist's linked account —
// the browser is then told that account separately (see StripeCardForm's
// stripeAccount).
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

// Every signing secret /api/stripe/webhook accepts, each with its mode.
// Jetenvoieca's own events and its connected accounts' events (artists'
// linked Stripe accounts, 2026-09-25) arrive from separate webhook
// destinations in Stripe, one per mode, each with its own secret — all
// four point at the same endpoint. Unset ones are skipped.
export function getWebhookSecrets(): { mode: StripeMode; secret: string }[] {
  const all: { mode: StripeMode; secret: string | undefined }[] = [
    { mode: "LIVE", secret: process.env.STRIPE_WEBHOOK_SECRET_LIVE },
    { mode: "TEST", secret: process.env.STRIPE_WEBHOOK_SECRET_TEST },
    { mode: "LIVE", secret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET_LIVE },
    { mode: "TEST", secret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST },
  ];
  return all.filter((s): s is { mode: StripeMode; secret: string } => !!s.secret);
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
