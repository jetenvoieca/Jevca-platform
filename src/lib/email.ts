// Shared email constants and helpers (2026-09-05, Email Integration).
//
// artistFromAddress builds an artist's own @jevca.art "from" address —
// used by every place that sends an email on a specific artist's behalf
// (invoiceEmail.ts, certificateEmail.ts, and inboundEmail.ts's
// reply-from-thread), so the exact address format and the "no slug yet"
// error message live in exactly one place rather than being duplicated
// across each caller.
//
// The Inbox holds two mailboxes (2026-09-27): ART — everything at
// jevca.art (every artist's address and craig@jevca.art) — and BUSINESS
// — everything at jetenvoieca.com. Which one a message belongs to is
// decided by domain alone, so any new address on the business domain
// (support@, etc.) lands in Business with no code change.
export const EMAIL_DOMAIN = "jevca.art";
export const BUSINESS_EMAIL_DOMAIN = "jetenvoieca.com";

export type Mailbox = "ART" | "BUSINESS";

export function mailboxForAddress(address: string): Mailbox {
  return address.toLowerCase().endsWith(`@${BUSINESS_EMAIL_DOMAIN}`) ? "BUSINESS" : "ART";
}

export type ArtistFromAddressResult =
  | { ok: true; from: string; address: string }
  | { ok: false; error: string };

export function artistFromAddress(artist: {
  name: string;
  emailSlug: string | null;
}): ArtistFromAddressResult {
  if (!artist.emailSlug) {
    return {
      ok: false,
      error: `${artist.name} doesn't have a sending address set yet — add one in Settings first.`,
    };
  }
  const address = `${artist.emailSlug}@${EMAIL_DOMAIN}`;
  return { ok: true, from: `${artist.name} <${address}>`, address };
}

// Campaign mails (2026-10-08, Craig's choice) go out from the artist's
// address at news.jevca.art, which has Resend's open and click tracking
// on — jevca.art keeps tracking off for invoices, receipts and replies.
// Replies go to the artist's normal jevca.art address, so they land in
// the Inbox. The same host serves the mails' images and the unsubscribe
// page (see middleware.ts).
export const CAMPAIGN_EMAIL_DOMAIN = "news.jevca.art";
export const CAMPAIGN_PUBLIC_URL = `https://${CAMPAIGN_EMAIL_DOMAIN}`;

export type CampaignAddressesResult =
  | { ok: true; from: string; replyTo: string }
  | { ok: false; error: string };

export function artistCampaignAddresses(artist: {
  name: string;
  emailSlug: string | null;
}): CampaignAddressesResult {
  const normal = artistFromAddress(artist);
  if (!normal.ok) return normal;
  return {
    ok: true,
    from: `${artist.name} <${artist.emailSlug}@${CAMPAIGN_EMAIL_DOMAIN}>`,
    replyTo: normal.address,
  };
}
