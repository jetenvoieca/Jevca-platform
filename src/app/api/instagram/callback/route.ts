import { passes, requireSiteAccess } from "@/lib/currentUser";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { completeInstagramConnection, readInstagramState } from "@/lib/instagram";

// Where Zernio returns after Connect Instagram is approved (or not).
// Checks the signed `state` the connect route put on this address,
// records the connection for that site's artist, and goes back to
// Marketing → Settings either way, with a message if it didn't work.
// Behind the admin login.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const siteId = await readInstagramState(params.get("state"));
  const site = siteId
    ? await db.site.findUnique({ where: { id: siteId }, select: { id: true, artistId: true } })
    : null;
  if (!site) return NextResponse.redirect(new URL("/", request.url));
  if (!(await passes(requireSiteAccess(site.id)))) return new Response("Not allowed.", { status: 403 });

  const back = (error: string | null) => {
    const url = new URL(`/sites/${site.id}/marketing/settings`, request.url);
    if (error) url.searchParams.set("instagramError", error);
    return NextResponse.redirect(url);
  };

  if (params.get("error")) {
    return back(
      params.get("error") === "oauth_denied"
        ? "The Instagram connection was cancelled."
        : params.get("error_message") || "Instagram couldn't be connected. Please try again."
    );
  }
  const profileId = params.get("profileId");
  const accountId = params.get("accountId");
  const username = params.get("username");
  if (params.get("connected") !== "instagram" || !profileId || !accountId || !username) {
    return back("Instagram didn't confirm the connection. Please try again.");
  }

  try {
    await completeInstagramConnection(site.artistId, { profileId, accountId, username });
  } catch (err) {
    return back(err instanceof Error ? err.message : "Couldn't connect Instagram.");
  }
  return back(null);
}
