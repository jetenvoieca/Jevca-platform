"use server";

import sharp from "sharp";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getFromR2, uploadToR2, deleteFromR2 } from "@/lib/r2";
import { generateImageSizes } from "@/lib/imageSizes";
import { deleteImageFiles } from "./imageDelete";

// The crop rectangle, as percentages (0–100) of the ROTATED image's
// bounding box — exactly what react-image-crop reports when drawn over
// the rotated preview in HopperCropEditor.tsx. Percentages rather than
// pixels because the editor works on the smaller display-size copy,
// while this crops the full-resolution original: same shape, different
// pixel counts. Not exported — a "use server" file may only export
// async functions; callers just pass a matching plain object.
type CropPercent = { x: number; y: number; width: number; height: number };

const JPEG_QUALITY = 92;

// Output keeps PNG/WebP as-is (so transparency survives); everything
// else — JPEG, HEIC, etc. — becomes JPEG, the same universally
// displayable format generateImageSizes already standardises on.
function outputFormatFor(mimeType: string) {
  if (mimeType === "image/png") return { ext: "png", contentType: "image/png" } as const;
  if (mimeType === "image/webp") return { ext: "webp", contentType: "image/webp" } as const;
  return { ext: "jpg", contentType: "image/jpeg" } as const;
}

// Keys look like `${artistId}/${uuid}-${sanitized-filename}` (see
// requestUploadUrl in media.ts). Keeps the readable filename part, swaps
// in a fresh uuid and the output extension — a new key (rather than
// overwriting the old one) means every browser/CDN cache of the old
// image is bypassed automatically, since the URL itself changes.
function croppedKeyFor(oldKey: string, artistId: string, ext: string) {
  const filename = oldKey.split("/").pop() ?? "";
  const withoutUuid = filename.length > 37 ? filename.slice(37) : filename;
  const base = withoutUuid.replace(/\.[^.]+$/, "") || "image";
  return `${artistId}/${randomUUID()}-${base}.${ext}`;
}

const clampPct = (n: number) => Math.min(100, Math.max(0, n));

// Crop + rotate a photo, replacing the original outright (2026-09-24,
// direct request — "replace it, original deleted"). Always works from
// the full-resolution original in R2, never the on-screen preview, so
// nothing is lost beyond what's actually cropped away.
//
// Order is deliberate, so a failure part-way can never leave the image
// broken: write the new files first, then point the DB row at them, and
// only then delete the old files. If anything fails before the DB
// update, the new files are cleaned up and the original is untouched.
export async function cropImage(
  imageId: string,
  crop: CropPercent,
  rotation: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const values = [crop.x, crop.y, crop.width, crop.height, rotation];
  if (values.some((v) => typeof v !== "number" || !Number.isFinite(v))) {
    return { ok: false, error: "Invalid crop." };
  }

  const image = await db.image.findUnique({
    where: { id: imageId },
    select: {
      artistId: true,
      key: true,
      thumbnailKey: true,
      displayKey: true,
      kind: true,
      mimeType: true,
    },
  });
  if (!image) return { ok: false, error: "That image couldn't be found." };
  if (image.kind !== "PHOTO") return { ok: false, error: "Only photos can be cropped." };

  const format = outputFormatFor(image.mimeType);
  const newKey = croppedKeyFor(image.key, image.artistId, format.ext);
  const newThumbnailKey = `${newKey}-thumb.jpg`;
  const newDisplayKey = `${newKey}-display.jpg`;

  try {
    const original = await getFromR2(image.key);
    if (!original.Body) throw new Error("Original file is empty.");
    const originalBytes = Buffer.from(await original.Body.transformToByteArray());

    // Step 1: apply the photo's own EXIF orientation (so it's upright
    // the same way the browser showed it), then the requested rotation.
    // Any angle that isn't a multiple of 90° grows the canvas to the
    // rotated bounding box — the same box the editor drew — with the
    // exposed corners filled (transparent where the format allows it).
    // Kept as raw pixels between the two steps: no re-encoding, so no
    // extra quality loss.
    const background =
      format.ext === "jpg"
        ? { r: 255, g: 255, b: 255, alpha: 1 }
        : { r: 255, g: 255, b: 255, alpha: 0 };
    const rotated = await sharp(originalBytes)
      .autoOrient()
      .rotate(rotation, { background })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width: W, height: H } = rotated.info;

    // Step 2: percentages → pixels of the full-size rotated image.
    const left = Math.min(W - 1, Math.round((clampPct(crop.x) / 100) * W));
    const top = Math.min(H - 1, Math.round((clampPct(crop.y) / 100) * H));
    const width = Math.max(1, Math.min(W - left, Math.round((clampPct(crop.width) / 100) * W)));
    const height = Math.max(1, Math.min(H - top, Math.round((clampPct(crop.height) / 100) * H)));

    const extracted = sharp(rotated.data, { raw: rotated.info }).extract({
      left,
      top,
      width,
      height,
    });
    const cropped =
      format.ext === "png"
        ? await extracted.png().toBuffer()
        : format.ext === "webp"
          ? await extracted.webp({ quality: JPEG_QUALITY }).toBuffer()
          : await extracted.jpeg({ quality: JPEG_QUALITY }).toBuffer();

    const sizes = await generateImageSizes(cropped);

    await Promise.all([
      uploadToR2(newKey, cropped, format.contentType),
      uploadToR2(newThumbnailKey, sizes.thumbnail, sizes.contentType),
      uploadToR2(newDisplayKey, sizes.display, sizes.contentType),
    ]);

    await db.image.update({
      where: { id: imageId },
      data: {
        key: newKey,
        url: `/api/media/${newKey}`,
        thumbnailKey: newThumbnailKey,
        displayKey: newDisplayKey,
        mimeType: format.contentType,
      },
    });
  } catch (err) {
    console.error(`[cropImage] Failed for image ${imageId}:`, err);
    await Promise.all(
      [newKey, newThumbnailKey, newDisplayKey].map((key) => deleteFromR2(key).catch(() => {}))
    );
    return { ok: false, error: "Couldn't crop this image. Try again." };
  }

  // Old files are only removed once the row points at the new ones.
  await deleteImageFiles(image);

  return { ok: true };
}
