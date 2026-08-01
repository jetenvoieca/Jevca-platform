import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY!;

// No apiVersion pinned deliberately — recent stripe-node defaults to the
// account's own configured API version when omitted, which is fine for a
// single-account setup like this one. Revisit and pin explicitly if this
// ever needs to be reproducible across more than one Stripe account.
export const stripe = new Stripe(secretKey);

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
