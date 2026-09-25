import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import {
  CONNECT_COOKIE_PATH,
  CONNECT_STATE_COOKIE,
  parseConnectState,
} from "@/lib/stripeConnect";

// Where Stripe returns after the artist approves (or cancels) linking
// their Stripe account — see the start route. Checks the nonce matches
// the one the start route set, swaps the one-off code for the account's
// id, and saves it as the artist's StripeConnection for that mode. From
// then on every NEW sale of theirs is paid into that account. Returns to
// the site's Settings page either way, with a message.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = parseConnectState(request.cookies.get(CONNECT_STATE_COOKIE)?.value);
  if (!state) {
    return new NextResponse(
      "This Stripe connection has expired. Please start again from the site's Settings page.",
      { status: 400 }
    );
  }

  const backToSettings = (key: "stripeConnect" | "stripeConnectError", value: string) => {
    const url = new URL(`/sites/${state.siteId}`, request.url);
    url.searchParams.set(key, value);
    const response = NextResponse.redirect(url);
    response.cookies.set(CONNECT_STATE_COOKIE, "", { path: CONNECT_COOKIE_PATH, maxAge: 0 });
    return response;
  };

  if (params.get("state") !== state.nonce) {
    return backToSettings("stripeConnectError", "The Stripe connection couldn't be verified. Please try again.");
  }
  if (params.get("error")) {
    return backToSettings(
      "stripeConnectError",
      params.get("error_description") || "The Stripe connection was cancelled."
    );
  }
  const code = params.get("code");
  if (!code) return backToSettings("stripeConnectError", "Stripe didn't return a connection code.");

  try {
    const platform = getStripeClient({ mode: state.mode, accountId: null });
    const token = await platform.oauth.token({ grant_type: "authorization_code", code });
    const accountId = token.stripe_user_id;
    if (!accountId) throw new Error("Stripe didn't return an account.");
    if (token.livemode !== (state.mode === "LIVE")) {
      throw new Error(`That connection wasn't made in ${state.mode.toLowerCase()} mode.`);
    }

    const account = await platform.accounts.retrieve(accountId);
    const accountName =
      account.business_profile?.name || account.settings?.dashboard?.display_name || account.email || null;

    await db.stripeConnection.upsert({
      where: { artistId_mode: { artistId: state.artistId, mode: state.mode } },
      create: { artistId: state.artistId, mode: state.mode, accountId, accountName },
      update: { accountId, accountName, connectedAt: new Date() },
    });
  } catch (err) {
    return backToSettings(
      "stripeConnectError",
      err instanceof Error ? err.message : "Couldn't connect the Stripe account."
    );
  }

  return backToSettings("stripeConnect", "connected");
}
