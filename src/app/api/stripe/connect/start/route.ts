import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import {
  CONNECT_COOKIE_PATH,
  CONNECT_REDIRECT_URI,
  CONNECT_STATE_COOKIE,
  getConnectClientId,
  type ConnectState,
} from "@/lib/stripeConnect";

// "Connect Stripe account" (Settings → Financial, 2026-09-25) — sends the
// browser to Stripe to sign in to the artist's own Stripe account and
// approve the link, for the artist's current mode (Test or Live). Stripe
// then returns to /api/stripe/connect/callback. Behind the admin login
// (not listed in middleware's public paths).
export async function GET(request: NextRequest) {
  const artistId = request.nextUrl.searchParams.get("artistId");
  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!artistId || !siteId) {
    return NextResponse.json({ error: "Missing artist or site." }, { status: 400 });
  }

  const site = await db.site.findFirst({
    where: { id: siteId, artistId },
    select: { artist: { select: { stripeMode: true } } },
  });
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 });

  const mode = site.artist.stripeMode;
  let authorizeUrl: string;
  const state: ConnectState = { nonce: crypto.randomUUID(), artistId, siteId, mode };
  try {
    authorizeUrl = getStripeClient({ mode, accountId: null }).oauth.authorizeUrl({
      response_type: "code",
      client_id: getConnectClientId(mode),
      scope: "read_write",
      redirect_uri: CONNECT_REDIRECT_URI,
      state: state.nonce,
    });
  } catch (err) {
    const url = new URL(`/sites/${siteId}`, request.url);
    url.searchParams.set(
      "stripeConnectError",
      err instanceof Error ? err.message : "Couldn't start the Stripe connection."
    );
    return NextResponse.redirect(url);
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(CONNECT_STATE_COOKIE, JSON.stringify(state), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: CONNECT_COOKIE_PATH,
    maxAge: 15 * 60,
  });
  return response;
}
