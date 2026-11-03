"use server";

import { requireArtistAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { publicMediaUrl } from "@/lib/r2";
import {
  cleanDynamicPresentation,
  dynamicImageIds,
  type DynamicMedia,
  type DynamicPresentation,
} from "@/lib/dynamicPresentation";

// A curation's Dynamic presentation (2026-11-03, phase one) — see
// lib/dynamicPresentation.ts. Edited on the Curations page; shown on
// Canvas pages (live in the admin preview, from the published snapshot
// on the site).

export type DynamicPresentationData = { presentation: DynamicPresentation; media: DynamicMedia };

// The presentation with the Media Catalogue pictures and videos it uses
// (those of the artist's still there) — null if the curation has none.
export async function getDynamicPresentation(
  curationId: string,
  artistId: string,
): Promise<DynamicPresentationData | null> {
  await requireArtistAccess(artistId);
  const row = await db.curation.findFirst({
    where: { id: curationId, artistId },
    select: { dynamicPresentation: true },
  });
  const presentation = cleanDynamicPresentation(row?.dynamicPresentation);
  if (!presentation) return null;
  const images = await db.image.findMany({
    where: { id: { in: dynamicImageIds(presentation) }, artistId },
    select: { id: true, kind: true, url: true, displayKey: true, posterUrl: true },
  });
  const media: DynamicMedia = {};
  for (const i of images) {
    media[i.id] =
      i.kind === "VIDEO"
        ? { kind: "VIDEO", url: i.url, posterUrl: i.posterUrl }
        : { kind: "PHOTO", url: publicMediaUrl(i.displayKey) || i.url, posterUrl: null };
  }
  return { presentation, media };
}

// Saves it (none when it has no sections).
export async function saveDynamicPresentation(
  curationId: string,
  artistId: string,
  raw: unknown,
): Promise<{ ok: true } | { error: string }> {
  await requireArtistAccess(artistId);
  const presentation = cleanDynamicPresentation(raw);
  const { count } = await db.curation.updateMany({
    where: { id: curationId, artistId },
    data: { dynamicPresentation: presentation ?? Prisma.DbNull },
  });
  if (count === 0) return { error: "Curation not found." };
  return { ok: true };
}
