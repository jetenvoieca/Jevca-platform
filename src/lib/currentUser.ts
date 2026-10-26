import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { readSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// The person logged in (2026-10-26) — from their login cookie, checked
// against the database: still switched on, and no new password (or
// switch-off) since they logged in (sessionVersion). Null otherwise.
// Server only.
export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "ARTIST";
  artistId: string | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const claims = await readSessionToken(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );
  if (!claims) return null;
  const user = await db.user.findUnique({
    where: { id: claims.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      artistId: true,
      active: true,
      sessionVersion: true,
    },
  });
  if (!user || !user.active || user.sessionVersion !== claims.version)
    return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    artistId: user.artistId,
  };
}

// The person logged in, who must be an admin — throws otherwise, so an
// admin-only action never runs for anyone else.
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN")
    throw new Error("Only an admin can do that.");
  return user;
}
