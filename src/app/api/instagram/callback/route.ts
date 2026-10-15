import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { completeInstagramConnection, readInstagramState } from "@/lib/instagram";

// Where Instagram returns after Connect Instagram is approved (or
// cancelled). Checks the signed `state` the connect route sent, saves the
// connection for that site's artist, and goes back to Marketing →
// Settings either way, with a message if it didn't work. Behind the
// admin login.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const siteId = await readInstagramState(params.get("state"));
  const site = siteId
    ? await db.site.findUnique({ where: { id: siteId }, select: { id: true, artistId: true } })
    : null;
  if (!site) return NextResponse.redirect(new URL("/", request.url));

  const back = (error: string | null) => {
    const url = new URL(`/sites/${site.id}/marketing/settings`, request.url);
    if (error) url.searchParams.set("instagramError", error);
    return NextResponse.redirect(url);
  };

  if (params.get("error")) return back("The Instagram connection was cancelled.");
  const code = params.get("code");
  if (!code) return back("Instagram didn't return a connection code.");

  try {
    await completeInstagramConnection(site.artistId, code);
  } catch (err) {
    return back(err instanceof Error ? err.message : "Couldn't connect Instagram.");
  }
  return back(null);
}
