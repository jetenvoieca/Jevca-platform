import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { readSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// The person logged in (2026-10-26) — from their login cookie, checked
// against the database: still switched on, and no new password (or
// switch-off) since they logged in (sessionVersion). Null otherwise.
// Server only.
//
// And the checks every server action and API route makes (artist logins
// stage 3): an admin may do anything; an artist login only what belongs
// to their own client (`artistId`). Each throws NotAllowedError
// otherwise, so the action stops before touching anything.
export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "ARTIST";
  artistId: string | null;
};

export class NotAllowedError extends Error {
  constructor(message = "You don't have access to that.") {
    super(message);
    this.name = "NotAllowedError";
  }
}

// Looked up once per request, however many checks ask.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  const claims = await readSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!claims) return null;
  const user = await db.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, email: true, name: true, role: true, artistId: true, active: true, sessionVersion: true },
  });
  if (!user || !user.active || user.sessionVersion !== claims.version || user.role !== claims.role) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role, artistId: user.artistId };
});

// Anyone logged in.
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new NotAllowedError("Log in again first.");
  return user;
}

// An admin only — Administration, Templates and the platform's own tools.
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new NotAllowedError("Only an admin can do that.");
  return user;
}

// An admin, or the artist login of this client.
export async function requireArtistAccess(artistId: string | null | undefined): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  if (!artistId || user.artistId !== artistId) throw new NotAllowedError();
  return user;
}

// An admin, or the artist login of the client whose site this is.
// Returns the site's client.
export async function requireSiteAccess(siteId: string): Promise<{ artistId: string }> {
  const site = await db.site.findUnique({ where: { id: siteId }, select: { artistId: true } });
  if (!site) throw new NotAllowedError("Site not found.");
  await requireArtistAccess(site.artistId);
  return site;
}

// An admin, or the artist login of the client a record belongs to —
// given the record's lookup (`select: { artistId: true }`). A record
// that isn't there is refused the same way.
export async function requireRecordAccess(
  record: Promise<{ artistId: string } | null>
): Promise<CurrentUser> {
  const found = await record;
  if (!found) throw new NotAllowedError("Not found.");
  return requireArtistAccess(found.artistId);
}

// For routes (2026-10-26): whether a check passes, so the route can answer
// 403 instead of failing.
export async function passes(check: Promise<unknown>): Promise<boolean> {
  try {
    await check;
    return true;
  } catch (err) {
    if (err instanceof NotAllowedError) return false;
    throw err;
  }
}
