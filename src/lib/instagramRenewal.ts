import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/secretBox";
import { INSTAGRAM_GRAPH, errorText, type ErrorFields } from "@/lib/instagram";

// Keeps every artist's Instagram connected (2026-10-15). An Instagram
// token lasts 60 days and can be renewed once it's a day old, so a daily
// run (netlify/functions/renew-instagram.mts → /api/instagram/renew)
// renews each one about a week after it was last made. A failed renewal
// is kept on the connection (`renewError`, shown in Marketing →
// Settings) and tried again the next day; one that has run out needs
// connecting again. Server-only.

const DAY_MS = 24 * 60 * 60 * 1000;
// Renewed once fewer than this many days are left — i.e. after a week.
const RENEW_WHEN_DAYS_LEFT = 53;
// Renewals done at once.
const BATCH = 10;

async function renewOne(connection: { id: string; accessTokenEncrypted: string }): Promise<boolean> {
  try {
    const params = new URLSearchParams({
      grant_type: "ig_refresh_token",
      access_token: decryptSecret(connection.accessTokenEncrypted),
    });
    const res = await fetch(`${INSTAGRAM_GRAPH}/refresh_access_token?${params}`);
    const body = (await res.json()) as ErrorFields & { access_token?: string; expires_in?: number };
    if (!body.access_token || !body.expires_in) {
      throw new Error(errorText(body, `Instagram answered ${res.status}`));
    }
    await db.instagramConnection.update({
      where: { id: connection.id },
      data: {
        accessTokenEncrypted: encryptSecret(body.access_token),
        expiresAt: new Date(Date.now() + body.expires_in * 1000),
        renewError: null,
      },
    });
    return true;
  } catch (err) {
    await db.instagramConnection.update({
      where: { id: connection.id },
      data: { renewError: err instanceof Error ? err.message : "Couldn't renew." },
    });
    return false;
  }
}

// Renews every connection that's due and still valid.
export async function renewInstagramConnections(): Promise<{ renewed: number; failed: number }> {
  const now = Date.now();
  const due = await db.instagramConnection.findMany({
    where: {
      expiresAt: { gt: new Date(now), lt: new Date(now + RENEW_WHEN_DAYS_LEFT * DAY_MS) },
    },
    select: { id: true, accessTokenEncrypted: true },
  });
  let renewed = 0;
  for (let i = 0; i < due.length; i += BATCH) {
    const results = await Promise.all(due.slice(i, i + BATCH).map(renewOne));
    renewed += results.filter(Boolean).length;
  }
  return { renewed, failed: due.length - renewed };
}
