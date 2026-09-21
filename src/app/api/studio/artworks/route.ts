import { NextRequest, NextResponse } from "next/server";
import { findArtistByToken } from "@/lib/studioAuth";
import { listStudioArtworks } from "@/lib/studioArtworks";

// One page of the artist's artworks for the Studio app's "Manage
// existing" screen. Authenticated by the artist's personal token, and
// only ever returns that artist's own artworks.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { token, q, offset } = (body ?? {}) as {
    token?: unknown;
    q?: unknown;
    offset?: unknown;
  };

  const artist = await findArtistByToken(token);
  if (!artist) {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }

  const result = await listStudioArtworks(
    artist.id,
    typeof q === "string" ? q.trim() : "",
    typeof offset === "number" && Number.isInteger(offset) && offset > 0 ? offset : 0
  );
  return NextResponse.json(result);
}
