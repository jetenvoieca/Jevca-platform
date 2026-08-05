// Signs and verifies session cookies for the app's single shared-password
// gate (see decisions log, 2026-08-05 — one password, no per-user
// accounts, no session store). Uses the Web Crypto API rather than Node's
// `crypto` module so the exact same code works in middleware (Edge
// runtime) and in server actions (Node runtime) without two
// implementations — confirmed available in both on this project's stack
// (Netlify runs Node 24).

export const SESSION_COOKIE_NAME = "jevca_session";

// 30 days — long enough that you and Louise aren't re-entering a
// password constantly, short enough that a stale cookie doesn't linger
// forever if a device is ever lost.
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

// The cookie value is just "<expiryTimestamp>.<signature>" — nothing to
// look up in a database, no session store, since there's only ever one
// valid password to check against.
export async function createSessionToken(): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  const expiresAt = Date.now() + SESSION_LIFETIME_MS;
  const signature = await hmac(secret, String(expiresAt));
  return `${expiresAt}.${signature}`;
}

export async function isValidSessionToken(
  token: string | undefined | null
): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;

  const [expiresAtRaw, signature] = token.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!expiresAtRaw || !signature || Number.isNaN(expiresAt)) return false;
  if (Date.now() > expiresAt) return false;

  const expected = await hmac(secret, expiresAtRaw);
  return safeEqual(expected, signature);
}
