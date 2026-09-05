import { db } from "@/lib/db";

// Local parts that must never be handed to an artist — the general
// admin address plus standard mail roles held in reserve, even though
// nothing sends from most of these yet (2026-09-05, Email Integration).
const RESERVED_SLUGS = new Set([
  "craig",
  "admin",
  "hello",
  "info",
  "invoices",
  "receipts",
  "support",
  "noreply",
  "no-reply",
  "webmaster",
  "postmaster",
  "abuse",
]);

function sanitize(raw: string): string {
  const slug = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents (e.g. é -> e)
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");
  return slug || "artist";
}

// Turns a name (or an already-slug-like string, when editing an
// existing one) into a real, unique local part for an @jevca.art
// address — auto-suggested from the artist's name when they're created
// (createSite in lib/actions.ts), and re-run through this same
// sanitiser/dedupe check whenever it's edited afterwards in Settings
// (updateArtist), so it can never collide with another artist or a
// reserved address (2026-09-05, Email Integration, direct decision:
// "auto-suggest from name, I can edit it").
//
// excludeArtistId lets an artist keep their own existing slug rather
// than being "bumped" by their own record when re-saving unchanged.
export async function generateUniqueEmailSlug(
  input: string,
  excludeArtistId?: string
): Promise<string> {
  const base = sanitize(input);
  let candidate = base;
  let n = 2;
  for (;;) {
    if (!RESERVED_SLUGS.has(candidate)) {
      const existing = await db.artist.findUnique({
        where: { emailSlug: candidate },
        select: { id: true },
      });
      if (!existing || existing.id === excludeArtistId) return candidate;
    }
    candidate = `${base}${n}`;
    n++;
  }
}
