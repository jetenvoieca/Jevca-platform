import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { deleteFromR2, getFromR2, uploadToR2 } from "@/lib/r2";
import { generateSquare } from "@/lib/imageSizes";

// Square versions of photos (2026-10-09), for campaign mail galleries set
// to Regularise. Each is made the first time it's needed, from the
// display-size file (or the original when there isn't one), stored next
// to the photo's other files and kept on the Image row; a photo that's
// cropped again loses it (imageCrop.ts) and gets a new one when next
// needed. Server-only plain module.

type SquareSource = {
  id: string;
  artistId: string;
  key: string;
  displayKey: string | null;
  squareKey: string | null;
};

// Each photo's square key, made where missing. A photo whose square
// can't be made is left out (the mail then shows it in its own shape).
export async function squareKeysFor(images: SquareSource[]): Promise<Map<string, string>> {
  const keys = new Map<string, string>();
  await Promise.all(
    images.map(async (image) => {
      if (image.squareKey) {
        keys.set(image.id, image.squareKey);
        return;
      }
      const made = await makeSquare(image).catch((err) => {
        console.error(`[imageSquares] Couldn't make a square for image ${image.id}:`, err);
        return null;
      });
      if (made) keys.set(image.id, made);
    })
  );
  return keys;
}

async function makeSquare(image: SquareSource): Promise<string | null> {
  const object = await getFromR2(image.displayKey ?? image.key);
  if (!object.Body) return null;
  const square = await generateSquare(Buffer.from(await object.Body.transformToByteArray()));
  const key = `${image.artistId}/${randomUUID()}-square.jpg`;
  await uploadToR2(key, square, "image/jpeg");

  // Two mails drawn at once may both make one: the first saved is kept,
  // the other's file removed. Nor is it kept if the photo was cropped
  // meanwhile (its files changed).
  const { count } = await db.image.updateMany({
    where: { id: image.id, squareKey: null, key: image.key, displayKey: image.displayKey },
    data: { squareKey: key },
  });
  if (count === 1) return key;
  await deleteFromR2(key).catch(() => {});
  const saved = await db.image.findUnique({ where: { id: image.id }, select: { squareKey: true } });
  return saved?.squareKey ?? null;
}
