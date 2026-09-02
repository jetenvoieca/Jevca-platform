import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { finalizeUpload } from "@/lib/actions/media";

// Called by the iPhone Shortcut — step 2 of 2, after it has PUT the file
// straight to the URL returned by /api/hopper/request-upload. Creates
// the Image row with status HOPPER, so it lands in the sorting queue
// rather than skipping straight into the catalogue the way a direct
// in-app upload does.
//
// caption/description (2026-09-02) — both optional. The Shortcut asks
// once for "Name" and "Description" before sending a batch, then sends
// the same two values along with every item's finalize call. Left blank
// (or omitted) by any older/未-updated copy of the Shortcut — that's the
// same as before this existed, not an error.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { token, key, contentType, kind, caption, description } = body as {
    token?: string;
    key?: string;
    contentType?: string;
    kind?: "PHOTO" | "VIDEO";
    caption?: string;
    description?: string;
  };

  if (!token || !key || !contentType || !kind) {
    return NextResponse.json(
      { error: "token, key, contentType, and kind are all required." },
      { status: 400 }
    );
  }

  const artist = await db.artist.findUnique({ where: { hopperToken: token } });
  if (!artist) {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }

  // Guard against a key issued for a different artist being replayed
  // against this artist's token — every key is prefixed with the
  // artistId it was generated for (see requestUploadUrl in media.ts).
  if (!key.startsWith(`${artist.id}/`)) {
    return NextResponse.json({ error: "Key does not belong to this artist." }, { status: 400 });
  }

  const result = await finalizeUpload(
    artist.id,
    key,
    contentType,
    kind,
    undefined,
    "HOPPER",
    "iPhone Shortcut",
    caption,
    description
  );

  return NextResponse.json(result);
}
