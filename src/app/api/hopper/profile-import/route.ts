import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveUpload, UnreadablePictureError } from "@/lib/mediaUpload";
import { ensureFixedEntries } from "@/lib/profileCatalogue";

// An artist's profile from their old ISYT site (2026-11-03, Craig's
// request), sent by the browser importer's "Import this ISYT site" —
// authenticated by the artist's hopperToken, like the rest of
// /api/hopper/*. Fills the Profile Catalogue's fixed entries (see
// lib/profileCatalogue.ts) without overwriting anything already there, so
// it can be sent again safely:
// - `biography`: the Biography / CV's text, if it has none yet; and the
//   profile photo (`key`, first PUT to the address from
//   /api/hopper/request-upload) as its picture, if it has none yet — then
//   saved into the Media Catalogue, not the Hopper.
// - `galleries` ([{ name, websiteUrl }], in the old site's order): each
//   added to the artist's Locations as a Gallery (with a contact holding
//   its website) unless one of that name exists, then added to the end
//   of the Galleries entry unless already on it. A Location of that name
//   that's the artist's own (type Own) isn't put on the list.
const MAX_TEXT = 20000;
const MAX_GALLERIES = 100;

function text(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

type GalleryIn = { name: string; websiteUrl: string };
type LocationRow = { id: string; name: string; type: string };

function readGalleries(value: unknown): GalleryIn[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: GalleryIn[] = [];
  for (const g of value.slice(0, MAX_GALLERIES)) {
    const name = text((g as { name?: unknown })?.name, 200);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, websiteUrl: text((g as { websiteUrl?: unknown })?.websiteUrl, 500) });
  }
  return out;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const token = text(body.token);
  if (!token) return NextResponse.json({ error: "token is required." }, { status: 400 });
  const artist = await db.artist.findUnique({ where: { hopperToken: token }, select: { id: true } });
  if (!artist) return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  const artistId = artist.id;

  await ensureFixedEntries(artistId);
  const entries = await db.profileStory.findMany({
    where: { artistId, kind: { in: ["BIOGRAPHY", "GALLERIES"] } },
    select: { id: true, kind: true, story: true, imageId: true },
  });
  const biographyEntry = entries.find((e) => e.kind === "BIOGRAPHY")!;
  const galleriesEntry = entries.find((e) => e.kind === "GALLERIES")!;

  // The Biography / CV: its text and picture, where it has none.
  const biography = text(body.biography);
  const key = text(body.key, 500);
  const contentType = text(body.contentType, 100);
  let biographyFilled = false;
  let pictureAdded = false;
  if (biography && !biographyEntry.story) {
    await db.profileStory.update({ where: { id: biographyEntry.id }, data: { story: biography } });
    biographyFilled = true;
  }
  if (key && !biographyEntry.imageId) {
    // A key issued for another artist is refused (see createUploadUrl).
    if (!key.startsWith(`${artistId}/`) || !contentType.startsWith("image/")) {
      return NextResponse.json({ error: "That picture doesn't belong to this artist." }, { status: 400 });
    }
    try {
      const saved = await saveUpload(artistId, key, contentType, "PHOTO", {
        rejectUnreadable: true,
        status: "SORTED",
        source: "Website import",
        caption: "Profile",
      });
      await db.profileStory.update({ where: { id: biographyEntry.id }, data: { imageId: saved.image.id } });
      pictureAdded = true;
    } catch (err) {
      if (err instanceof UnreadablePictureError) {
        return NextResponse.json({ error: err.message }, { status: 422 });
      }
      throw err;
    }
  }

  // The galleries: found or made as Locations, then added to the list.
  const galleries = readGalleries(body.galleries);
  const locations = await db.location.findMany({
    where: { artistId },
    select: { id: true, name: true, type: true },
  });
  const byName = new Map<string, LocationRow>(locations.map((l: LocationRow) => [l.name.toLowerCase(), l]));
  const listed = await db.profileGallery.findMany({
    where: { storyId: galleriesEntry.id },
    select: { locationId: true, position: true },
  });
  const onList = new Set(listed.map((g) => g.locationId));
  let position = listed.reduce((max, g) => Math.max(max, g.position), -1) + 1;
  let locationsAdded = 0;
  let galleriesListed = 0;
  // A new Gallery Location, with its contact holding the website.
  const makeGallery = (g: GalleryIn): Promise<LocationRow> =>
    db.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: { artistId, kind: "GALLERY", name: g.name, websiteUrl: g.websiteUrl || null },
        select: { id: true },
      });
      return tx.location.create({
        data: { artistId, name: g.name, type: "GALLERY", customerId: customer.id },
        select: { id: true, name: true, type: true },
      });
    });
  for (const g of galleries) {
    const known = byName.get(g.name.toLowerCase());
    const location = known ?? (await makeGallery(g));
    if (!known) {
      byName.set(g.name.toLowerCase(), location);
      locationsAdded++;
    }
    if (location.type !== "GALLERY" || onList.has(location.id)) continue;
    await db.profileGallery.create({ data: { storyId: galleriesEntry.id, locationId: location.id, position } });
    onList.add(location.id);
    position++;
    galleriesListed++;
  }

  return NextResponse.json({ biographyFilled, pictureAdded, locationsAdded, galleriesListed });
}
