import { db } from "@/lib/db";
import { APP_URL } from "@/lib/appUrl";
import { encryptSecret, decryptSecret } from "@/lib/secretBox";

// Craig's own Gmail in the Inbox's Personal tab (2026-10-09). Talks to
// Google directly over its REST endpoints — no Google SDK, which would
// add a large package for a handful of calls.
//
// Google setup (one-off, Craig's Workspace): a Google Cloud project with
// the Gmail API switched on, an OAuth consent screen set to Internal (so
// only isendyouthis.com accounts can use it, and it never needs Google's
// review), and a Web OAuth client whose redirect URI is GMAIL_REDIRECT_URI
// below. Its ID and secret are GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in
// Netlify. Server-only.

export const GMAIL_REDIRECT_URI = `${APP_URL}/api/gmail/callback`;
// Read, send, archive and move to Bin — but never delete for good.
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

// The one-off nonce the connect route hands Google, checked on return.
export const GMAIL_STATE_COOKIE = "gmail_connect_state";
export const GMAIL_COOKIE_PATH = "/api/gmail";

function clientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — set them in Netlify first.");
  }
  return { clientId, clientSecret };
}

// Google's sign-in page. `prompt=consent` makes Google hand back a fresh
// long-lived permission every time, even on a reconnect.
export function gmailAuthorizeUrl(nonce: string): string {
  const { clientId } = clientCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: GMAIL_REDIRECT_URI,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: nonce,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

async function requestToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  return (await res.json()) as TokenResponse;
}

// The address of the Gmail account a token belongs to.
async function profileEmail(accessToken: string): Promise<string> {
  const res = await fetch(`${GMAIL_API}/profile`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error("Couldn't read the Gmail account.");
  const profile = (await res.json()) as { emailAddress?: string };
  if (!profile.emailAddress) throw new Error("Couldn't read the Gmail account.");
  return profile.emailAddress;
}

// Swaps the code Google returned for the account's permission and saves
// it (replacing any earlier connection — there's only ever one).
export async function completeGmailConnection(code: string): Promise<void> {
  const { clientId, clientSecret } = clientCredentials();
  const token = await requestToken({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: GMAIL_REDIRECT_URI,
  });
  if (!token.access_token || !token.refresh_token) {
    throw new Error(token.error_description || "Google didn't grant access.");
  }
  const email = await profileEmail(token.access_token);
  const refreshTokenEncrypted = encryptSecret(token.refresh_token);
  await db.$transaction([
    db.gmailConnection.deleteMany({ where: { email: { not: email } } }),
    db.gmailConnection.upsert({
      where: { email },
      create: { email, refreshTokenEncrypted },
      update: { refreshTokenEncrypted, connectedAt: new Date() },
    }),
  ]);
  cachedAccess = { token: token.access_token, expiresAt: Date.now() + (token.expires_in ?? 0) * 1000 };
}

export async function getGmailConnection(): Promise<{ email: string } | null> {
  return db.gmailConnection.findFirst({ select: { email: true } });
}

// A short-lived access token, reused while it lasts (within one server
// instance) and otherwise fetched fresh from the saved permission. Null
// if Gmail isn't connected, or the permission has been withdrawn.
let cachedAccess: { token: string; expiresAt: number } | null = null;

export async function getGmailAccessToken(): Promise<string | null> {
  if (cachedAccess && cachedAccess.expiresAt - 60_000 > Date.now()) return cachedAccess.token;
  const connection = await db.gmailConnection.findFirst({ select: { refreshTokenEncrypted: true } });
  if (!connection) return null;
  const { clientId, clientSecret } = clientCredentials();
  const token = await requestToken({
    grant_type: "refresh_token",
    refresh_token: decryptSecret(connection.refreshTokenEncrypted),
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (!token.access_token) return null;
  cachedAccess = { token: token.access_token, expiresAt: Date.now() + (token.expires_in ?? 0) * 1000 };
  return cachedAccess.token;
}

// Disconnect: withdraws the permission at Google too, so it can't be used
// even from a copy, then forgets it.
export async function removeGmailConnection(): Promise<void> {
  const connection = await db.gmailConnection.findFirst({ select: { refreshTokenEncrypted: true } });
  if (connection) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: decryptSecret(connection.refreshTokenEncrypted) }),
      });
    } catch {
      // Already withdrawn, or Google unreachable — forgotten here either way.
    }
  }
  await db.gmailConnection.deleteMany({});
  cachedAccess = null;
}
