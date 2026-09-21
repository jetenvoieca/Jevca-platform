import { NextRequest, NextResponse } from "next/server";
import { readStudioRequest } from "@/lib/studioRequest";
import { listStudioArtworks } from "@/lib/studioArtworks";

// One page of the artist's artworks for the Studio app's "Manage
// existing" screen. Authenticated by the artist's personal token, and
// only ever returns that artist's own artworks.
export async function POST(request: NextRequest) {
  const req = await readStudioRequest(request);
  if ("response" in req) return req.response;
  const { artist, fields } = req;

  const result = await listStudioArtworks(
    artist.id,
    typeof fields.q === "string" ? fields.q.trim() : "",
    typeof fields.offset === "number" && Number.isInteger(fields.offset) && fields.offset > 0
      ? fields.offset
      : 0
  );
  return NextResponse.json(result);
}
