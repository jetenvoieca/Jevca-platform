import { db } from "@/lib/db";
import { CAMPAIGN_PUBLIC_URL } from "@/lib/email";

// Unsubscribing from campaign mails (2026-10-08). Every mail carries the
// subscriber's own link, news.jevca.art/unsubscribe/<token> (a page that
// asks to confirm), and one-click List-Unsubscribe headers that let
// Gmail, Apple Mail and others unsubscribe straight from their own
// button (a POST to …/one-click). Unsubscribed people stay on file and
// are never sent campaigns again. Test mails use the token "test",
// which unsubscribes no one. Server-only plain module.

export const TEST_UNSUBSCRIBE_TOKEN = "test";

export function unsubscribePageUrl(token: string): string {
  return `${CAMPAIGN_PUBLIC_URL}/unsubscribe/${encodeURIComponent(token)}`;
}

// The headers that put an Unsubscribe button in the email app itself.
export function unsubscribeHeaders(token: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribePageUrl(token)}/one-click>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

// Tokens are long random strings; anything else is refused before
// touching the database.
function isTokenShaped(token: string): boolean {
  return /^[a-z0-9]{16,128}$/i.test(token);
}

export async function findSubscriberByToken(token: string) {
  if (!isTokenShaped(token)) return null;
  return db.subscriber.findUnique({
    where: { unsubscribeToken: token },
    select: {
      email: true,
      language: true,
      status: true,
      artist: { select: { name: true, invoiceLanguage: true } },
    },
  });
}

// Unsubscribes whoever the token belongs to. Doing it again changes
// nothing (the first date is kept).
export async function unsubscribeByToken(token: string): Promise<boolean> {
  if (!isTokenShaped(token)) return false;
  const { count } = await db.subscriber.updateMany({
    where: { unsubscribeToken: token, status: "SUBSCRIBED" },
    data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
  });
  return count > 0;
}
