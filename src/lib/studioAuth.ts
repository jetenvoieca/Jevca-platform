import { db } from "@/lib/db";

// Studio's only credential is the artist's own personal hopperToken —
// the same one the /api/hopper routes check. Every /api/studio route and
// the /studio page start here, so "who is this?" is answered in exactly
// one place. Returns null for anything that isn't a known token.
export async function findArtistByToken(token: unknown) {
  if (typeof token !== "string" || !token) return null;
  return db.artist.findUnique({
    where: { hopperToken: token },
    select: { id: true, name: true, logoUrl: true },
  });
}
