import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { instagramConnectUrl } from "@/lib/instagram";

// "Connect Instagram" in Marketing → Settings (2026-10-15) — sends the
// browser to Instagram's login (via Zernio), for this site's artist.
// Behind the admin login.
export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("siteId") ?? "";
  const site = await db.site.findUnique({ where: { id: siteId }, select: { id: true, artistId: true } });
  if (!site) return NextResponse.redirect(new URL("/", request.url));

  try {
    return NextResponse.redirect(await instagramConnectUrl(site.id, site.artistId));
  } catch (err) {
    const back = new URL(`/sites/${site.id}/marketing/settings`, request.url);
    back.searchParams.set("instagramError", err instanceof Error ? err.message : "Couldn't start the Instagram connection.");
    return NextResponse.redirect(back);
  }
}
