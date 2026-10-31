"use server";

import { db } from "@/lib/db";
import { requireArtistAccess, requireRecordAccess } from "@/lib/currentUser";
import { publicMediaUrl } from "@/lib/r2";
import { revalidatePath } from "next/cache";
import { appendImageToTimeline } from "./videoEditor";
import { createArtworkWithRetry } from "./artworks";
import { deleteImagePermanently, deleteImagesPermanently } from "./imageDelete";
import { noteHopperProcessed } from "@/lib/hopperAlerts";

// None of these actions revalidate /sites/[id]/hopper OR /sites/[id]/
// artworks (2026-08-17, second pass at this same fix) — both those
// pages are already force-dynamic (never cached to begin with, so
// revalidatePath had no real purpose on either), and every client flow
// that wants an immediate refresh already calls router.refresh()
// explicitly (see advanceAfterAction in HopperView.tsx). Calling
// revalidatePath on the route someone is currently viewing triggers an
// automatic background client refresh regardless of any explicit
// router.refresh() elsewhere — that's confirmed as the actual cause of
// a real bug (the "Add Artwork" flow's inline quick-catalogue fields
// being wiped out before anyone could type into them). The first pass
// at this fix only removed the /hopper call, reasoning that /artworks
// was a genuinely different route and therefore safe — but the bug
// persisted after that fix shipped, which means that reasoning doesn't
// hold: /hopper and /artworks share the same parent layout
// (src/app/sites/[id]/layout.tsx), and revalidating one apparently
// still causes Next to refresh whatever route is actually being viewed
// under that shared layout, not just the literal path named. Rather
// than rely on precisely understanding Next's internal revalidation
// mechanics here, this now follows the same rule already proven correct
// everywhere else in this project: don't revalidate a force-dynamic
// route from a Server Action at all — let explicit router.refresh()
// calls do that job. /bucket is kept, since appendImageToTimeline
// building that route's data is a genuine, different case worth
// checking if this recurs there too.

// The client a picture belongs to, once the person logged in is checked
// to have access to it (2026-10-26), and whether it's still in the Hopper
// — taking it out counts towards the Dashboard's Hopper alert
// (2026-10-31, see noteHopperProcessed).
async function imageOwner(imageId: string): Promise<{ artistId: string; inHopper: boolean }> {
  const image = await db.image.findUnique({ where: { id: imageId }, select: { artistId: true, status: true } });
  await requireRecordAccess(Promise.resolve(image));
  return { artistId: image!.artistId, inHopper: image!.status === "HOPPER" };
}

// Returns rows already in the exact shape HopperView's HopperItem
// expects (2026-09-24) — this mapping used to be copied by hand into
// both Hopper pages (/sites/[id]/hopper and /preview/[slug]/hopper),
// which had to be kept in step with this select separately and had
// already broken the build once when they drifted. Now it lives here,
// once.
export async function listHopperQueue(artistId: string) {
  await requireArtistAccess(artistId);
  const rows = await db.image.findMany({
    where: { artistId, status: "HOPPER" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      url: true,
      // Added 2026-09-24 for the crop editor, which works on the smaller
      // display copy rather than the full-size original (see
      // HopperCropEditor.tsx).
      displayKey: true,
      posterUrl: true,
      kind: true,
      caption: true,
      description: true,
      // Added 2026-09-19, direct request — lets the sorting card show a
      // Title/Description preview only for items that actually arrived
      // via the iPhone Shortcut (see the matching note in
      // HopperView.tsx), rather than for every source that happens to
      // carry a caption/description.
      source: true,
      // What the Studio app sent with the photo — see the note on
      // Image.artworkSize in schema.prisma.
      artworkSize: true,
      artworkPrice: true,
      artworkType: true,
      artworkLocation: true,
      // What the browser importer read from an old website (2026-10-26)
      // — see the note on Image.artworkMedium in schema.prisma.
      artworkMedium: true,
      artworkEdition: true,
      artworkSold: true,
      artworkViewingLocation: true,
      sourceUrl: true,
      altText: true,
      tags: true,
      createdAt: true,
    },
  });
  return rows.map(({ displayKey, artworkPrice, createdAt, ...rest }) => ({
    ...rest,
    artworkPrice: artworkPrice?.toString() ?? null,
    displayUrl: publicMediaUrl(displayKey),
    createdAt: createdAt.toISOString(),
  }));
}

// 2026-08-19, direct request — was `status: "ARCHIVED"` (the same
// reversible-delete pattern used everywhere else in this app), changed
// specifically for Images: there was never a Trash/Archived view to
// actually find and restore one, so "reversible" was theoretical, not
// real. See deleteImagePermanently for the full reasoning — this stays
// scoped to Images; Site archiving (a completely different, much bigger
// action) is untouched.
export async function binHopperItem(
  id: string,
  siteId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { artistId, inHopper } = await imageOwner(id);
  const result = await deleteImagePermanently(id);
  if (result.ok && inHopper) await noteHopperProcessed(artistId);
  return result;
}

// Bulk version of binHopperItem (2026-09-07, direct request — "add
// ability to bulk select images to delete") for the Up next grid's
// select mode — see deleteImagesPermanently.
export async function binHopperItems(
  artistId: string,
  ids: string[]
): Promise<{ deletedCount: number; failed: { id: string; error: string }[] }> {
  await requireArtistAccess(artistId);
  const inHopper = await db.image.findMany({
    where: { id: { in: ids }, artistId, status: "HOPPER" },
    select: { id: true },
  });
  const result = await deleteImagesPermanently(artistId, ids);
  const failed = new Set(result.failed.map((f) => f.id));
  await noteHopperProcessed(artistId, inHopper.filter((i) => !failed.has(i.id)).length);
  return result;
}

export async function addHopperItemToMedia(id: string, siteId: string): Promise<void> {
  const { artistId, inHopper } = await imageOwner(id);
  await db.image.update({ where: { id }, data: { status: "SORTED", needsReview: true } });
  if (inHopper) await noteHopperProcessed(artistId);
}

export async function addHopperItemToBucket(
  id: string,
  siteId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { artistId, inHopper } = await imageOwner(id);
  const result = await appendImageToTimeline(artistId, siteId, id);
  if (result.ok) {
    revalidatePath(`/sites/${siteId}/bucket`);
    if (inHopper) await noteHopperProcessed(artistId);
  }
  return result;
}

// Replaces the old two-step "Add Artwork" flow (2026-08-18, direct
// request). Previously: pressing "Add Artwork" created the Artwork
// immediately via quickCreateArtwork (a real, live catalogue entry from
// that click alone), then each inline Catalogue field saved itself
// separately as it was filled in. Now nothing is written to the database
// until this single action runs, fired once from "Done, next item": the
// artwork is created with every field the person filled in, and the
// Hopper image is linked to it (as its main image) as part of the same
// action. Cancelling before "Done, next item" needs no cleanup at all,
// since nothing was ever created — that's the main benefit over the old
// approach, not just fewer clicks.
//
// Renamed "Add Artwork" → "Create new artwork" (2026-09-13, direct
// request), and its form now matches the full Artwork Catalogue tab —
// Name and Reference/Offered price included — with only the
// Available/SOLD toggle left out (a brand-new artwork always starts
// AVAILABLE; see QuickCatalogueFields in HopperView.tsx). Name comes
// straight from this form's own `catalogueName` field. Description is
// left blank.
//
// needsReview stays true here, same as the old quickCreateArtwork(...,
// true) call did — filling in these fields is still optional, so a
// Hopper-created artwork can genuinely still be incomplete even after
// this. It clears automatically the first time Catalogue is properly
// saved from the full editor (see updateCatalogue in artworks.ts).
export async function createArtworkFromHopperQuick(
  hopperImageId: string,
  siteId: string,
  artistId: string,
  formData: FormData
): Promise<{ ok: true; artwork: { id: string } } | { ok: false; error: string }> {
  await requireArtistAccess(artistId);
  // The picture must be this client's.
  const picture = await db.image.findFirst({ where: { id: hopperImageId, artistId }, select: { status: true } });
  if (!picture) return { ok: false, error: "That item couldn't be found." };
  const title = ((formData.get("catalogueName") as string) || "").trim() || "Untitled";
  const offeredPriceRaw = (formData.get("offeredPrice") as string)?.trim();
  const dateRaw = (formData.get("date") as string)?.trim();
  const type = (formData.get("type") as string)?.trim() || null;
  const size = (formData.get("size") as string)?.trim() || null;
  const edition = (formData.get("edition") as string)?.trim() || null;
  const availableQtyRaw = (formData.get("availableQty") as string)?.trim();
  const location = (formData.get("location") as string)?.trim() || null;
  const studioNotes = (formData.get("studioNotes") as string)?.trim() || null;
  const medium = (formData.get("medium") as string)?.trim() || null;
  // Only on the form for a work imported from an old website (2026-10-26
  // — see QuickCatalogueFields): its description, where it can be seen,
  // and whether it was marked sold there.
  const description = (formData.get("description") as string)?.trim() || null;
  const viewingLocation = (formData.get("viewingLocation") as string)?.trim() || null;
  const sold = formData.get("sold") === "on";

  let artwork: { id: string };
  try {
    artwork = await createArtworkWithRetry(artistId, {
      catalogueName: title,
      offeredPrice: offeredPriceRaw || null,
      // Mirrors updateCatalogue's own "Offered price also sets
      // Presentation's Price" behaviour (see the note on
      // Artwork.presentationPrice in schema.prisma) — kept in sync from
      // the moment the artwork is first created, not just on later
      // edits. presentationPrice is typed as a number here (unlike
      // offeredPrice above, read as a raw string) — same conversion
      // duplicateArtwork already does.
      presentationPrice: offeredPriceRaw ? Number(offeredPriceRaw) : null,
      type,
      size,
      edition,
      availableQty: availableQtyRaw ? parseInt(availableQtyRaw, 10) : null,
      location,
      studioNotes,
      medium,
      description,
      viewingLocation,
      // No Available/SOLD toggle on this form (2026-09-13, direct
      // request) — an artwork created here starts AVAILABLE, unless it
      // was imported from an old website that marked it sold (2026-10-26).
      availability: sold ? "SOLD" : "AVAILABLE",
      date: dateRaw || null,
      needsReview: true,
    });
  } catch {
    return { ok: false, error: "Couldn't create the catalogue entry. Try again." };
  }

  await db.$transaction(async (tx) => {
    await tx.image.update({
      where: { id: hopperImageId },
      data: { status: "SORTED" },
    });
    await tx.artwork.update({ where: { id: artwork.id }, data: { mainImageId: hopperImageId } });
  });
  if (picture.status === "HOPPER") await noteHopperProcessed(artistId);

  return { ok: true, artwork: { id: artwork.id } };
}

// ---------- Notes sent from the Studio app (2026-10-31) ----------

export type HopperNoteItem = { id: string; text: string; createdAt: string };

// The client's Hopper notes, oldest first like the rest of the Hopper.
export async function listHopperNotes(artistId: string): Promise<HopperNoteItem[]> {
  await requireArtistAccess(artistId);
  const rows = await db.hopperNote.findMany({
    where: { artistId },
    orderBy: { createdAt: "asc" },
    select: { id: true, text: true, createdAt: true },
  });
  return rows.map((n) => ({ id: n.id, text: n.text, createdAt: n.createdAt.toISOString() }));
}

// Done: the note has been read and dealt with, so it leaves the Hopper.
export async function completeHopperNote(id: string): Promise<void> {
  const note = await db.hopperNote.findUnique({ where: { id }, select: { artistId: true } });
  await requireRecordAccess(Promise.resolve(note));
  const { count } = await db.hopperNote.deleteMany({ where: { id } });
  await noteHopperProcessed(note!.artistId, count);
}
