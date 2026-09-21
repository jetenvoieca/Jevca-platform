import { NextRequest, NextResponse } from "next/server";
import { findArtistByToken } from "@/lib/studioAuth";
import { consignStudioArtwork } from "@/lib/studioArtworks";

// Consigns one of the artist's artworks to a location from their own
// Locations list. Authenticated by the artist's personal token.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { token, artworkId, location } = (body ?? {}) as {
    token?: unknown;
    artworkId?: unknown;
    location?: unknown;
  };

  const artist = await findArtistByToken(token);
  if (!artist) {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }

  if (typeof artworkId !== "string" || !artworkId || typeof location !== "string" || !location) {
    return NextResponse.json({ error: "artworkId and location are required." }, { status: 400 });
  }

  const result = await consignStudioArtwork(artist.id, artworkId, location);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
