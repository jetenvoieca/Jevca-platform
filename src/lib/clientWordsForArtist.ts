import { db } from "@/lib/db";
import { clientWords, type ClientWords } from "@/lib/clientKind";

// Server-side counterpart of useClientWords (2026-10-09): the wording for
// one client's type, for messages written on the server.
export async function clientWordsForArtist(artistId: string): Promise<ClientWords> {
  const artist = await db.artist.findUniqueOrThrow({
    where: { id: artistId },
    select: { kind: true },
  });
  return clientWords(artist.kind);
}
