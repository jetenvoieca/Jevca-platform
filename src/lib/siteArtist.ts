// What a site's pages show about its artist (2026-10-13): the Logo, for
// Logo components, and the footer at the bottom of every page — like the
// footer of a campaign mail. Plain module, not "use server", so the
// server actions, the published snapshot and the pages share it.

export type SiteFooter = {
  name: string;
  // Where the artist is — town, postcode and country (e.g. "Peyriac de
  // Mer 11440 France"), never the street (Craig's choice, 2026-10-13);
  // null if none is set in Settings.
  town: string | null;
  // The artist's @jevca.art address (Craig's choice), so messages land in
  // the Inbox; null if they have none yet.
  email: string | null;
};

export type SiteArtist = {
  logoUrl: string | null;
  // Words under the Logo (2026-10-22); absent from sites published before.
  logoByline?: string | null;
  // Links to the artist's Instagram and Facebook (2026-10-23), shown
  // under a Side list menu; absent from sites published before.
  social?: { instagramUrl: string | null; facebookUrl: string | null };
  footer: SiteFooter;
};

// The artist's town, postcode and country on one line, for the website
// footer.
export function artistTownLine(artist: {
  postcode: string | null;
  city: string | null;
  country: string | null;
}): string | null {
  const line = [artist.city, artist.postcode, artist.country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return line || null;
}

// The artist's full address as footer lines — campaign mails' footer
// (lib/mailAssets.ts).
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
