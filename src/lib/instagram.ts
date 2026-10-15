import { db } from "@/lib/db";
import { APP_URL } from "@/lib/appUrl";
import { encryptSecret } from "@/lib/secretBox";
import { createSignedState, isValidSignedState } from "@/lib/auth";

// Each artist's Instagram, connected for posting from the Social page
// (2026-10-15). Uses Business Login for Instagram (the Instagram API with
// Instagram login) over its REST endpoints — no SDK. The account must be
// a professional (Business or Creator) one.
//
// Meta setup (one-off, 2026-10-15): the Meta app "JEVCA Studio" (business
// portfolio JEVCA Studio), use case "Manage messaging & content on
// Instagram", with instagram_business_basic and
// instagram_business_content_publish, and INSTAGRAM_REDIRECT_URI below as
// its business login redirect URL. Its Instagram app ID and secret are
// INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET in Netlify. Until Meta's App
// Review, only accounts added as Instagram Testers (App Roles → Roles)
// can connect. Server-only.

export const INSTAGRAM_REDIRECT_URI = `${APP_URL}/api/instagram/callback`;
const SCOPE = "instagram_business_basic,instagram_business_content_publish";
export const INSTAGRAM_GRAPH = "https://graph.instagram.com";

// The connect route's `state`: the site, then a signature for it that
// lasts 15 minutes — so the callback knows whose Instagram it is, and
// accepts only a sign-in this app started.
const STATE_PURPOSE = "instagram-connect";
const STATE_LIFETIME_MS = 15 * 60 * 1000;

export async function instagramState(siteId: string): Promise<string> {
  return `${siteId}~${await createSignedState(`${STATE_PURPOSE}:${siteId}`, STATE_LIFETIME_MS)}`;
}

// The site a returned `state` was made for, or null if it isn't genuine.
export async function readInstagramState(state: string | null): Promise<string | null> {
  const [siteId, signed] = (state ?? "").split("~");
  if (!siteId || !signed) return null;
  return (await isValidSignedState(`${STATE_PURPOSE}:${siteId}`, signed)) ? siteId : null;
}

function appCredentials(): { appId: string; appSecret: string } {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("Missing INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET — set them in Netlify first.");
  }
  return { appId, appSecret };
}

// Instagram's sign-in page.
export function instagramAuthorizeUrl(state: string): string {
  const { appId } = appCredentials();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: INSTAGRAM_REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    // Always ask which account, so the right artist's is chosen.
    force_reauth: "true",
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${params}`;
}

type ErrorFields = { error_message?: string; error?: { message?: string } };

function errorText(body: ErrorFields, fallback: string): string {
  return body.error_message || body.error?.message || fallback;
}

// Swaps the code Instagram returned for a 60-day token, reads the
// account, and saves it for the artist (replacing any earlier one).
export async function completeInstagramConnection(artistId: string, code: string): Promise<void> {
  const { appId, appSecret } = appCredentials();

  const shortRes = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: INSTAGRAM_REDIRECT_URI,
      code,
    }),
  });
  const shortBody = (await shortRes.json()) as ErrorFields & {
    data?: { access_token?: string; permissions?: string }[];
    access_token?: string;
    permissions?: string;
  };
  const short = shortBody.data?.[0] ?? shortBody;
  if (!short.access_token) throw new Error(errorText(shortBody, "Instagram didn't grant access."));
  if (!short.permissions?.includes("instagram_business_content_publish")) {
    throw new Error("Permission to post wasn't given — please connect again and allow it.");
  }

  const longParams = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: appSecret,
    access_token: short.access_token,
  });
  const longRes = await fetch(`${INSTAGRAM_GRAPH}/access_token?${longParams}`);
  const long = (await longRes.json()) as ErrorFields & { access_token?: string; expires_in?: number };
  if (!long.access_token || !long.expires_in) {
    throw new Error(errorText(long, "Instagram didn't grant a lasting connection."));
  }

  const meParams = new URLSearchParams({ fields: "user_id,username", access_token: long.access_token });
  const meRes = await fetch(`${INSTAGRAM_GRAPH}/me?${meParams}`);
  const me = (await meRes.json()) as ErrorFields & { user_id?: string | number; username?: string };
  if (!me.user_id || !me.username) throw new Error(errorText(me, "Couldn't read the Instagram account."));

  const data = {
    instagramUserId: String(me.user_id),
    username: me.username,
    accessTokenEncrypted: encryptSecret(long.access_token),
    expiresAt: new Date(Date.now() + long.expires_in * 1000),
    connectedAt: new Date(),
  };
  await db.instagramConnection.upsert({
    where: { artistId },
    create: { artistId, ...data },
    update: data,
  });
}

export type InstagramAccount = { username: string; expiresAt: Date };

export async function getInstagramAccount(artistId: string): Promise<InstagramAccount | null> {
  return db.instagramConnection.findUnique({
    where: { artistId },
    select: { username: true, expiresAt: true },
  });
}
