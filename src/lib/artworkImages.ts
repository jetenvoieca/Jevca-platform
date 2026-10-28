import { publicMediaUrl } from "@/lib/r2";

// An artwork's images as the admin screens show them (2026-10-03) —
// shared by the Artwork Catalogue's detail panel and the Curations
// page, so both read the same images the same way.
export type ArtworkImage = {
  id: string;
  // Small thumbnail (600px), for tiles.
  url: string;
  // Larger version (1800px), for a big preview.
  displayUrl: string;
  kind: string;
  posterUrl: string | null;
};

type ImageRow = {
  id: string;
  url: string;
  thumbnailKey: string | null;
  displayKey: string | null;
  kind: string;
  posterUrl: string | null;
};

// Main image first, if one is set — everything else keeps the order it
// was given in. Each falls back to the original file when its smaller
// versions haven't been generated.
export function toArtworkImages(images: ImageRow[], mainImageId: string | null): ArtworkImage[] {
  return images
    .slice()
    .sort((a, b) => {
      if (a.id === mainImageId) return -1;
      if (b.id === mainImageId) return 1;
      return 0;
    })
    .map((img) => ({
      id: img.id,
      url: publicMediaUrl(img.thumbnailKey) || img.url,
      displayUrl: publicMediaUrl(img.displayKey) || publicMediaUrl(img.thumbnailKey) || img.url,
      kind: img.kind,
      posterUrl: img.posterUrl,
    }));
}
