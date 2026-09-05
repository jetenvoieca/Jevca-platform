import { NextRequest, NextResponse } from "next/server";
import { isValidSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Paths that authenticate themselves separately, or need to be reachable
// without the app's shared password:
// - /api/hopper/*         — the iPhone Shortcut, authenticated by its own
//   per-artist hopperToken (see hopper-design.md)
// - /api/stripe/webhook   — authenticated by Stripe's own signature check
// - /api/platform-subscriptions/webhook — same: authenticated by Stripe's
//   own signature check (the PLATFORM account, not an artist's — see
//   platformStripe.ts). Missing here entirely until 2026-08-18 — every
//   delivery from Stripe was silently redirected to /login instead of
//   reaching the route at all, which is why every subscription payment
//   from a linked artist's card was recorded as a 100%-failure webhook on
//   Stripe's own side and never once created a row in the app.
// - /api/shotstack/render-webhook — Shotstack doesn't sign its webhooks,
//   so this endpoint authenticates itself differently: it never trusts
//   the POST body, only uses it to know which render to re-check via a
//   direct, API-key-authenticated call back to Shotstack (see the route
//   itself for the full reasoning)
// - /api/media/*          — serves the actual image/video files out of R2.
//   Has to be reachable by things that aren't a logged-in browser session
//   at all — Shotstack fetching source clips to render (what this fixes),
//   and eventually the public-facing site itself once that's built. The
//   files behind it aren't sensitive; the login wall exists to protect
//   the admin tool, not the media library.
// - /api/webhooks/resend-inbound — authenticated by Resend's own webhook
//   signature check (resend.webhooks.verify in the route itself), same
//   pattern as the two Stripe webhooks above — and the exact same bug as
//   those originally had (2026-09-05): every delivery was being silently
//   redirected to /login (a 307, which Resend correctly treats as a
//   failed delivery and keeps retrying) instead of ever reaching the
//   route, so no reply was ever actually processed despite Resend
//   showing "email.received" firing correctly on its side.
// - /login                — has to be reachable before you're logged in
const PUBLIC_PATH_PREFIXES = [
  "/api/hopper",
  "/api/stripe/webhook",
  "/api/platform-subscriptions/webhook",
  "/api/shotstack/render-webhook",
  "/api/media",
  "/api/webhooks/resend-inbound",
  "/login",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authenticated = await isValidSessionToken(token);

  if (!authenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own static/image assets — those carry
  // nothing sensitive and gating them just adds needless redirects.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
