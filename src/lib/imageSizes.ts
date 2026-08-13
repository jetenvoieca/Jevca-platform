import sharp from "sharp";

// Two derived sizes generated once, at upload time, rather than on every
// view (2026-08-13 — see decisions log for the full "why"). Chosen sizes:
//  - thumbnail: comfortably covers the catalogue grid tiles (rendered at
//    well under 300px even on a dense 9-per-row desktop layout) with
//    headroom for retina displays.
//  - display: comfortably covers the detail panel's image area, and is
//    still far smaller than a typical original photo (often 4000px+
//    wide from a phone or camera).
// The original, full-resolution file is always kept untouched in R2 —
// this never replaces it, only adds two smaller siblings alongside it.
const THUMBNAIL_WIDTH = 600;
const DISPLAY_WIDTH = 1800;
const JPEG_QUALITY = 82;

export type GeneratedImageSizes = {
  thumbnail: Buffer;
  display: Buffer;
  contentType: "image/jpeg";
};

// Converts to JPEG regardless of the source format (including HEIC from
// iPhones), since JPEG is universally displayable in every browser and
// email client — unlike HEIC, which many browsers still can't render.
export async function generateImageSizes(
  original: Buffer
): Promise<GeneratedImageSizes> {
  const [thumbnail, display] = await Promise.all([
    sharp(original)
      .rotate() // applies the original's EXIF orientation, then strips it — otherwise a resized image can come out sideways
      .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer(),
    sharp(original)
      .rotate()
      .resize({ width: DISPLAY_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer(),
  ]);

  return { thumbnail, display, contentType: "image/jpeg" };
}
