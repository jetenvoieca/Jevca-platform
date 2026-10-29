import { db } from "@/lib/db";
import { deleteFromR2 } from "@/lib/r2";

// Shared last step of any permanent image delete below — removing the
// actual stored files from R2 once the DB row itself is confirmed gone.
// Best-effort: a file that's already missing from R2, or a transient
// storage error, shouldn't leave the DB row undeleted or surface as a
// failure to the caller; the DB delete is what actually matters for the
// person's immediate action. Also used by cropImage (imageCrop.ts) to
// remove the pre-crop files once the cropped version has replaced them.
// A file another Image row still uses is left in place — a Create
// Derivative copy shares its original's files (duplicateArtwork).
export async function deleteImageFiles(image: {
  key: string;
  thumbnailKey: string | null;
  displayKey: string | null;
  squareKey: string | null;
}) {
  const keys = [image.key, image.thumbnailKey, image.displayKey, image.squareKey].filter(
    (key): key is string => !!key
  );
  if (keys.length === 0) return;
  const stillUsed = await db.image.findMany({
    where: {
      OR: [
        { key: { in: keys } },
        { thumbnailKey: { in: keys } },
        { displayKey: { in: keys } },
        { squareKey: { in: keys } },
      ],
    },
    select: { key: true, thumbnailKey: true, displayKey: true, squareKey: true },
  });
  const used = new Set(stillUsed.flatMap((r) => [r.key, r.thumbnailKey, r.displayKey, r.squareKey]));
  await Promise.all(keys.filter((key) => !used.has(key)).map((key) => deleteFromR2(key).catch(() => {})));
}

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
    select: { key: true, thumbnailKey: true, displayKey: true, squareKey: true },
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
        "Couldn't delete — this image is still linked elsewhere (e.g. a catalogue entry's main image, or a rendered video's result). Remove that link first.",
    };
  }

  await deleteImageFiles(image);

  return { ok: true };
}

// Several at once (the Hopper's Up next and the Media Catalogue's Select,
// 2026-10-15) — the same per-image delete, so the two can never behave
// differently, limited to this artist's own images. Partial failure is
// reported back (which ids and why) rather than all-or-nothing, so one
// image still linked elsewhere doesn't block deleting the rest.
export async function deleteImagesPermanently(
  artistId: string,
  ids: string[]
): Promise<{ deletedCount: number; failed: { id: string; error: string }[] }> {
  const own = await db.image.findMany({
    where: { id: { in: ids }, artistId },
    select: { id: true },
  });
  const results = await Promise.all(
    own.map(async ({ id }) => ({ id, result: await deleteImagePermanently(id) }))
  );
  const failed = results.flatMap((r) => (r.result.ok ? [] : [{ id: r.id, error: r.result.error }]));
  return { deletedCount: results.length - failed.length, failed };
}
