// Signs and verifies login cookies (2026-10-26: one per person — see
// User in schema.prisma — replacing the single shared password of
// 2026-08-05). Uses the Web Crypto API rather than Node's `crypto`
// module so the same code works in middleware (Edge runtime) and in
// server actions (Node runtime). Password hashing, which needs Node, is
// in lib/passwords.ts.

export const SESSION_COOKIE_NAME = "jevca_session";

// 30 days — long enough not to be re-entering a password constantly,
// short enough that a stale cookie doesn't linger forever if a device is
// ever lost.
const SESSION_LIFETIME_MS = 1000 * 60 * 60 * 24 * 30;
export const SESSION_MAX_AGE_SECONDS = SESSION_LIFETIME_MS / 1000;

async function hmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time-ish comparison so a mistyped/forged token can't be
// distinguished by how quickly the check fails.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Who a login cookie is for: the person's id and their sessionVersion
// when they logged in.
export type SessionClaims = { userId: string; version: number };

// The cookie value is "<userId>.<sessionVersion>.<expiryTimestamp>.<signature>",
// signed over the first three. Nothing is stored for it; whether the
// person may still log in (switched off, a new password since) is
// checked against the database by lib/currentUser.ts.
export async function createSessionToken(claims: SessionClaims): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  const payload = `${claims.userId}.${claims.version}.${Date.now() + SESSION_LIFETIME_MS}`;
  return `${payload}.${await hmac(secret, `session:${payload}`)}`;
}

// The cookie's claims if it's genuine and not expired, otherwise null.
// The old shared-password cookies (two parts) never pass, so everyone
// logs in again once.
export async function readSessionToken(token: string | undefined | null): Promise<SessionClaims | null> {
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, versionRaw, expiresAtRaw, signature] = parts;
  const version = Number(versionRaw);
  const expiresAt = Number(expiresAtRaw);
  if (!userId || !Number.isInteger(version) || !Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  const expected = await hmac(secret, `session:${userId}.${versionRaw}.${expiresAtRaw}`);
  return safeEqual(expected, signature) ? { userId, version } : null;
}

// A short-lived signed value for one purpose (2026-10-09, first used as
// the Gmail connection's OAuth `state`): "<expiry>.<signature>", signed
// over the purpose too, so it can never be mistaken for a session token
// or for another purpose's value. Needs nothing stored and no cookie, so
// it still checks out when the sign-in comes back in a different window
// (the iPad's home-screen app) or after Connect was pressed twice.
export async function createSignedState(purpose: string, lifetimeMs: number): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  const expiresAt = String(Date.now() + lifetimeMs);
  return `${expiresAt}.${await hmac(secret, `${purpose}:${expiresAt}`)}`;
}

export async function isValidSignedState(purpose: string, state: string | null): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!state || !secret) return false;
  const [expiresAtRaw, signature] = state.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!expiresAtRaw || !signature || Number.isNaN(expiresAt) || Date.now() > expiresAt) return false;
  return safeEqual(await hmac(secret, `${purpose}:${expiresAtRaw}`), signature);
}
