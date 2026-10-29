import { publicMediaUrl } from "@/lib/r2";

// A picture or video as the admin screens show it (2026-10-03) — a
// work's one picture (Artwork.mainImage) in the Artwork Catalogue, the
// Media Catalogue's Artworks view and the Curations page, and the
// pictures a curation chooses for a work's presentation.
export type ArtworkImage = {
  id: string;
  // Small thumbnail (600px), for tiles.
  url: string;
  // Larger version (1800px), for a big preview.
  displayUrl: string;
  kind: string;
  posterUrl: string | null;
};

// What toArtworkImage needs of an Image row — use in a Prisma select.
export const ARTWORK_IMAGE_SELECT = {
  id: true,
  url: true,
  thumbnailKey: true,
  displayKey: true,
  kind: true,
  posterUrl: true,
} as const;

type ImageRow = {
  id: string;
  url: string;
  thumbnailKey: string | null;
  displayKey: string | null;
  kind: string;
  posterUrl: string | null;
};

// Each size falls back to the original file when its smaller versions
// haven't been generated.
export function toArtworkImage(img: ImageRow): ArtworkImage {
  return {
    id: img.id,
    url: publicMediaUrl(img.thumbnailKey) || img.url,
    displayUrl: publicMediaUrl(img.displayKey) || publicMediaUrl(img.thumbnailKey) || img.url,
    kind: img.kind,
    posterUrl: img.posterUrl,
  };
}
