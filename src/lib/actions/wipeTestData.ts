"use server";

import { db } from "@/lib/db";
import { deleteFromR2 } from "@/lib/r2";

// One-time cleanup tool (2026-09-13, direct request) — "Art World"'s test
// artworks/media had got into a broken state (some images couldn't be
// deleted through the normal UI, giving 404s) and the request was to
// wipe the whole thing so testing could restart from a blank sheet,
// explicitly leaving Louise Dear's real content untouched.
//
// Deliberately NOT wired into any navigation — reached only by knowing
// the direct URL (/sites/[id]/wipe-test-data), and meant to be removed
// again (this file, the page, and the form component) once it's been
// used the one time it was asked for, per direct instruction ("one-time
// cleanup button... then it's gone").
//
// The Louise Dear name check below is a second, independent safety net
// on top of the confirmation typing required in the UI — belt and
// braces specifically because this is destructive and irreversible.
const PROTECTED_ARTIST_NAMES = ["louise dear"];

export async function wipeArtistContent(
  artistId: string
): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const artist = await db.artist.findUnique({ where: { id: artistId }, select: { id: true, name: true } });
  if (!artist) return { ok: false, error: "Artist not found." };
  if (PROTECTED_ARTIST_NAMES.includes(artist.name.trim().toLowerCase())) {
    return { ok: false, error: `Refusing to touch "${artist.name}" — this artist is protected.` };
  }

  // Collect the R2 object keys to delete afterwards, once the DB side
  // has committed — deleting from storage first and having the DB
  // transaction fail partway through would leave dangling DB rows
  // pointing at already-gone files, the worse of the two failure modes.
  const images = await db.image.findMany({
    where: { artistId },
    select: { key: true, thumbnailKey: true, displayKey: true },
  });

  const result = await db.$transaction(async (tx) => {
    const artworks = await tx.artwork.findMany({ where: { artistId }, select: { id: true } });
    const artworkIds = artworks.map((a) => a.id);

    const purchases = await tx.purchase.findMany({
      where: { artworkId: { in: artworkIds } },
      select: { id: true },
    });
    const purchaseIds = purchases.map((p) => p.id);

    const paymentCount = (await tx.payment.deleteMany({ where: { purchaseId: { in: purchaseIds } } })).count;
    await tx.outboundEmail.deleteMany({ where: { purchaseId: { in: purchaseIds } } });
    const purchaseCount = (await tx.purchase.deleteMany({ where: { id: { in: purchaseIds } } })).count;
    const saleTermsCount = (await tx.saleTerms.deleteMany({ where: { artworkId: { in: artworkIds } } })).count;
    const customerCount = (await tx.customer.deleteMany({ where: { artistId } })).count;

    // Clear the two Restrict-protected relations first (2026-09-12's
    // fix, see schema.prisma) — an Image still set as an artwork's main
    // image, or a video render's result, would otherwise block its own
    // deletion below exactly the way it's now supposed to.
    await tx.artwork.updateMany({ where: { artistId }, data: { mainImageId: null } });
    const videoRenderCount = (await tx.videoRender.deleteMany({ where: { artistId } })).count;

    const imageCount = (await tx.image.deleteMany({ where: { artistId } })).count;
    const artworkCount = (await tx.artwork.deleteMany({ where: { artistId } })).count;

    return {
      artworkCount,
      imageCount,
      purchaseCount,
      paymentCount,
      saleTermsCount,
      customerCount,
      videoRenderCount,
    };
  });

  // Best-effort — same reasoning as deleteImagePermanently: a file
  // that's already gone, or a transient storage error, shouldn't be
  // treated as a failure of the cleanup itself, which already succeeded
  // in the database.
  await Promise.all(
    images
      .flatMap((img) => [img.key, img.thumbnailKey, img.displayKey])
      .filter((key): key is string => !!key)
      .map((key) => deleteFromR2(key).catch(() => {}))
  );

  const summary = [
    `${result.artworkCount} artwork${result.artworkCount === 1 ? "" : "s"}`,
    `${result.imageCount} media item${result.imageCount === 1 ? "" : "s"}`,
    `${result.purchaseCount} sale${result.purchaseCount === 1 ? "" : "s"}`,
    `${result.paymentCount} payment${result.paymentCount === 1 ? "" : "s"}`,
    `${result.saleTermsCount} sale term${result.saleTermsCount === 1 ? "" : "s"}`,
    `${result.customerCount} customer${result.customerCount === 1 ? "" : "s"}`,
    `${result.videoRenderCount} video render${result.videoRenderCount === 1 ? "" : "s"}`,
  ].join(", ");

  return { ok: true, summary: `Deleted: ${summary}.` };
}
