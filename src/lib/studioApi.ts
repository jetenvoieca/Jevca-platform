import { postJson } from "@/lib/postJson";
import type { StudioArtworkTile } from "@/lib/studioArtworks";

// Browser-side calls to the token-authenticated /api/studio routes.

export function fetchStudioArtworks(token: string, q: string, offset: number) {
  return postJson<{ artworks: StudioArtworkTile[]; total: number }>("/api/studio/artworks", {
    token,
    q,
    offset,
  });
}

export function consignArtwork(token: string, artworkId: string, location: string) {
  return postJson<{ location: string }>("/api/studio/consign", { token, artworkId, location });
}
