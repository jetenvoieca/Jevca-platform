// Shared helper for building an artist's own @jevca.art "from" address
// (2026-09-05, Email Integration) — used by every place that sends an
// email on a specific artist's behalf (invoiceEmail.ts, certificateEmail.ts,
// and inboundEmail.ts's reply-from-thread), so the exact address format
// and the "no slug yet" error message live in exactly one place rather
// than being duplicated across each caller.
export const EMAIL_DOMAIN = "jevca.art";

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
