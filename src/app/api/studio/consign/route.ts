import { NextRequest, NextResponse } from "next/server";
import { readStudioRequest, text } from "@/lib/studioRequest";
import { consignStudioArtwork } from "@/lib/studioArtworks";

// Consigns one of the artist's artworks to a location from their own
// Locations list. Authenticated by the artist's personal token.
export async function POST(request: NextRequest) {
  const req = await readStudioRequest(request);
  if ("response" in req) return req.response;
  const { artist, fields } = req;

  const artworkId = text(fields.artworkId);
  const location = text(fields.location);
  if (!artworkId || !location) {
    return NextResponse.json({ error: "artworkId and location are required." }, { status: 400 });
  }

  const result = await consignStudioArtwork(artist.id, artworkId, location);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
