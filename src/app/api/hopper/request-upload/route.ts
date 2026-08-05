import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestUploadUrl } from "@/lib/actions/media";

// Called by the iPhone Shortcut — step 1 of 2. Authenticated by the
// artist's own hopperToken (see hopper-design.md), not the app's shared
// login password; deliberately excluded from src/middleware.ts for that
// reason, since the Shortcut can't complete a browser login.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { token, filename, contentType } = body as {
    token?: string;
    filename?: string;
    contentType?: string;
  };

  if (!token || !filename || !contentType) {
    return NextResponse.json(
      { error: "token, filename, and contentType are all required." },
      { status: 400 }
    );
  }

  const artist = await db.artist.findUnique({ where: { hopperToken: token } });
  if (!artist) {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }

  const result = await requestUploadUrl(artist.id, filename, contentType);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
