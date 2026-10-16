import { db } from "@/lib/db";
import { APP_URL } from "@/lib/appUrl";
import { createSignedState, isValidSignedState } from "@/lib/auth";
import { zernio, ZernioError } from "@/lib/zernio";

// Each artist's Instagram, connected for posting from the Social page
// (2026-10-15; through Zernio since 2026-10-16 — see lib/zernio.ts).
// Connect sends the artist to Instagram's own login (via Zernio), which
// comes back to /api/instagram/callback. The account must be a
// professional (Business or Creator) one. Server-only.

// Where Zernio sends the browser back to; the `state` on it is the site,
// then a signature lasting 15 minutes — so the callback knows whose
// Instagram it is, and accepts only a connection this app started.
const STATE_PURPOSE = "instagram-connect";
const STATE_LIFETIME_MS = 15 * 60 * 1000;

async function callbackUrl(siteId: string): Promise<string> {
  const state = `${siteId}~${await createSignedState(`${STATE_PURPOSE}:${siteId}`, STATE_LIFETIME_MS)}`;
  return `${APP_URL}/api/instagram/callback?${new URLSearchParams({ state })}`;
}

// The site a returned `state` was made for, or null if it isn't genuine.
export async function readInstagramState(state: string | null): Promise<string | null> {
  const [siteId, signed] = (state ?? "").split("~");
  if (!siteId || !signed) return null;
  return (await isValidSignedState(`${STATE_PURPOSE}:${siteId}`, signed)) ? siteId : null;
}

// The artist's Zernio profile, made the first time it's needed.
async function zernioProfileId(artistId: string): Promise<string> {
  const artist = await db.artist.findUniqueOrThrow({
    where: { id: artistId },
    select: { name: true, zernioProfileId: true },
  });
  if (artist.zernioProfileId) return artist.zernioProfileId;
  const created = await zernio<{ profile?: { _id?: string }; _id?: string }>("/profiles", {
    method: "POST",
    body: { name: `${artist.name} (${artistId})` },
  });
  // Zernio's examples show the new profile both on its own and wrapped.
  const profileId = created.profile?._id ?? created._id;
  if (!profileId) throw new Error("Zernio didn't return the new profile.");
  await db.artist.update({ where: { id: artistId }, data: { zernioProfileId: profileId } });
  return profileId;
}

// Instagram's login page, for this site's artist.
export async function instagramConnectUrl(siteId: string, artistId: string): Promise<string> {
  const params = new URLSearchParams({
    profileId: await zernioProfileId(artistId),
    redirect_url: await callbackUrl(siteId),
  });
  const { authUrl } = await zernio<{ authUrl: string }>(`/connect/instagram?${params}`);
  return authUrl;
}

// Records the account Zernio connected — once checked to be in the
// artist's own profile — replacing any earlier one.
export async function completeInstagramConnection(
  artistId: string,
  result: { profileId: string; accountId: string; username: string }
): Promise<void> {
  const artist = await db.artist.findUnique({ where: { id: artistId }, select: { zernioProfileId: true } });
  if (!artist?.zernioProfileId || artist.zernioProfileId !== result.profileId) {
    throw new Error("The Instagram connection didn't match this artist. Please try again.");
  }
  const previous = await db.instagramConnection.findUnique({ where: { artistId } });
  if (previous && previous.zernioAccountId !== result.accountId) {
    await removeZernioAccount(previous.zernioAccountId);
  }
  const data = { zernioAccountId: result.accountId, username: result.username, connectedAt: new Date() };
  await db.instagramConnection.upsert({ where: { artistId }, create: { artistId, ...data }, update: data });
}

// Disconnects an account at Zernio (so it's no longer billed); one
// already gone is fine.
export async function removeZernioAccount(accountId: string): Promise<void> {
  try {
    await zernio(`/accounts/${accountId}`, { method: "DELETE" });
  } catch (err) {
    if (!(err instanceof ZernioError && err.status === 404)) throw err;
  }
}

export async function getInstagramAccount(artistId: string): Promise<{ username: string } | null> {
  return db.instagramConnection.findUnique({ where: { artistId }, select: { username: true } });
}
