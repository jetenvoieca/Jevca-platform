import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { finalizeUpload } from "@/lib/actions/media";

// Trims a value from the request body and treats anything that isn't a
// non-empty string as "not provided".
function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim() || undefined;
}

// Called by the iPhone Shortcut — step 2 of 2, after it has PUT the file
// straight to the URL returned by /api/hopper/request-upload. Creates
// the Image row with status HOPPER, so it lands in the sorting queue
// rather than skipping straight into the catalogue the way a direct
// in-app upload does.
//
// caption/description (2026-09-02) — both optional. The Shortcut asks
// once for "Name" and "Description" before sending a batch, then sends
// the same two values along with every item's finalize call. Left blank
// (or omitted, by an older copy of the Shortcut) is the same as before
// this existed, not an error.
//
// source (2026-09-18) — optional, defaults to "iPhone Shortcut" so the
// real Shortcut (which has never sent this field) is completely
// unaffected. Added because this same endpoint is also used by the
// browser "Hopper Importer" extension, which was previously getting
// silently mislabeled as "iPhone Shortcut" too — now it sends its own
// source explicitly instead. HopperView's sorting card shows a
// Title/Description preview only when source is exactly "iPhone
// Shortcut" (see the note there), so this distinction is what makes
// that gating actually correct rather than lumping every caller of this
// route together.
//
// artworkSize/artworkPrice/artworkType (2026-09-21) — optional, sent by
// the Studio capture app (source "Studio"). Blank or omitted is the same
// as before this existed. artworkPrice must be a plain number (or a
// numeric string) and is rejected otherwise, rather than silently stored
// as something else.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    token,
    key,
    contentType,
    kind,
    caption,
    description,
    source,
    artworkSize,
    artworkPrice,
    artworkType,
  } = body as {
    token?: string;
    key?: string;
    contentType?: string;
    kind?: "PHOTO" | "VIDEO";
    caption?: unknown;
    description?: unknown;
    source?: unknown;
    artworkSize?: unknown;
    artworkPrice?: unknown;
    artworkType?: unknown;
  };

  if (!token || !key || !contentType || !kind) {
    return NextResponse.json(
      { error: "token, key, contentType, and kind are all required." },
      { status: 400 }
    );
  }

  let price: string | undefined;
  if (artworkPrice !== undefined && artworkPrice !== null && artworkPrice !== "") {
    const amount = Number(artworkPrice);
    if (!Number.isFinite(amount) || amount < 0 || amount > 99999999.99) {
      return NextResponse.json(
        { error: "artworkPrice must be a number between 0 and 99999999.99." },
        { status: 400 }
      );
    }
    price = String(amount);
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

  const result = await finalizeUpload(artist.id, key, contentType, kind, {
    status: "HOPPER",
    source: optionalText(source) ?? "iPhone Shortcut",
    caption: optionalText(caption),
    description: optionalText(description),
    artworkSize: optionalText(artworkSize),
    artworkPrice: price,
    artworkType: optionalText(artworkType),
  });

  return NextResponse.json(result);
}
