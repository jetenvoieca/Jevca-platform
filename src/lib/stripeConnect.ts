import { APP_URL, type StripeMode } from "@/lib/stripe";

// Stripe Connect OAuth (2026-09-25) — how an artist links their own
// existing Stripe account, so their sales are paid straight into it (see
// StripeConnection in schema.prisma). Test and Live each have their own
// OAuth client ID in Stripe (Settings → Connect → Onboarding options →
// OAuth), set in Netlify as STRIPE_CONNECT_CLIENT_ID_TEST/_LIVE.

// Must match the redirect URI registered in Stripe for both modes.
export const CONNECT_REDIRECT_URI = `${APP_URL}/api/stripe/connect/callback`;

// Holds what the start route needs the callback to know — which artist
// and mode, which site to return to, and a one-off nonce that must come
// back from Stripe unchanged (protects against a forged callback).
export const CONNECT_STATE_COOKIE = "stripe_connect_state";
export const CONNECT_COOKIE_PATH = "/api/stripe/connect";

export type ConnectState = {
  nonce: string;
  artistId: string;
  siteId: string;
  mode: StripeMode;
};

export function getConnectClientId(mode: StripeMode): string {
  const id =
    mode === "LIVE"
      ? process.env.STRIPE_CONNECT_CLIENT_ID_LIVE
      : process.env.STRIPE_CONNECT_CLIENT_ID_TEST;
  if (!id) {
    throw new Error(
      `Missing STRIPE_CONNECT_CLIENT_ID_${mode} — set it in Netlify before connecting a ${mode.toLowerCase()}-mode Stripe account.`
    );
  }
  return id;
}

export function parseConnectState(raw: string | undefined): ConnectState | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (
      typeof s.nonce === "string" &&
      typeof s.artistId === "string" &&
      typeof s.siteId === "string" &&
      (s.mode === "TEST" || s.mode === "LIVE")
    ) {
      return s;
    }
  } catch {
    // Unreadable — treated as missing.
  }
  return null;
}
