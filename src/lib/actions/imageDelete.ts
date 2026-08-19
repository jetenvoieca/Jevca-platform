import { db } from "@/lib/db";
import { deleteFromR2 } from "@/lib/r2";

// 2026-08-19, direct request — replaces the Archive pattern for Images
// specifically (status: "ARCHIVED", same convention used everywhere else
// in this app for a reversible "delete"). Decided against for Images
// because there was never a way to actually see or restore an archived
// one — no Trash/Archived view exists, and the request was explicit:
// no interest in building comprehensive search/retrieval just to make
// archiving meaningful, so a real delete is more honest than a
// soft-delete nobody can undo anyway.
//
// Deliberately NOT applied to Site archiving (a different, much bigger
// action — pausing an entire client's account, not discarding one
// photo) or Artwork deletion (already a real delete, unrelated to this
// change).
//
// Shared between the Hopper's Bin and the Media Catalogue's Delete —
// same operation either way: remove the DB row and every R2 object it
// references (key, plus the smaller derived thumbnail/display versions
// where those exist).
export async function deleteImagePermanently(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const image = await db.image.findUnique({
    where: { id },
    select: { key: true, thumbnailKey: true, displayKey: true },
  });
  if (!image) return { ok: true }; // Already gone — nothing to do.

  try {
    await db.image.delete({ where: { id } });
  } catch {
    // Most likely cause: this image is still referenced elsewhere — as
    // an artwork's main image, or as a video render's result image (both
    // are real foreign-key constraints, not swallowed silently — see the
    // Image relations in schema.prisma, none of which cascade or
    // set-null on purpose, so this can't happen invisibly). Whatever the
    // exact cause, fail with something the person can actually act on
    // rather than a generic crash.
    return {
      ok: false,
      error:
        "Couldn't delete — this image is still linked elsewhere (e.g. an artwork's main image, or a rendered video's result). Remove that link first.",
    };
  }

  // Best-effort — a file that's already gone from R2, or a transient
  // storage error, shouldn't leave the DB row undeleted or surface as a
  // failure here; the DB delete above is what actually matters for the
  // person's immediate action.
  await Promise.all(
    [image.key, image.thumbnailKey, image.displayKey]
      .filter((key): key is string => !!key)
      .map((key) => deleteFromR2(key).catch(() => {}))
  );

  return { ok: true };
}
