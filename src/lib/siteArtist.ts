// What a site's pages show about its artist (2026-10-13): the Logo, for
// Logo components, and the footer at the bottom of every page — like the
// footer of a campaign mail. Plain module, not "use server", so the
// server actions, the published snapshot and the pages share it.

export type SiteFooter = {
  name: string;
  // Street, postcode and town, country — whichever are set in Settings.
  address: string[];
  // The artist's @jevca.art address (Craig's choice), so messages land in
  // the Inbox; null if they have none yet.
  email: string | null;
};

export type SiteArtist = {
  logoUrl: string | null;
  footer: SiteFooter;
};

// The artist's address as footer lines — shared with campaign mails'
// footer (lib/mailAssets.ts).
export function artistAddressLines(artist: {
  addressLine1: string | null;
  postcode: string | null;
  city: string | null;
  country: string | null;
}): string[] {
  const placeLine = [artist.postcode, artist.city].filter(Boolean).join(" ");
  return [artist.addressLine1, placeLine, artist.country].filter((l): l is string =>
    Boolean(l?.trim())
  );
}
