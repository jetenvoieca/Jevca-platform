"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type SettingsField =
  | "artworkGroups"
  | "artworkTypes"
  | "artworkLocations"
  | "mediumPresets"
  | "sizePresets";

// These presets belong to the Artist now (same reasoning as Artwork
// ownership) — shared across all of that artist's sites, not duplicated
// per site.
export async function getArtworkSettings(artistId: string) {
  const artist = await db.artist.findUnique({
    where: { id: artistId },
    select: {
      artworkGroups: true,
      artworkTypes: true,
      artworkLocations: true,
      mediumPresets: true,
      sizePresets: true,
    },
  });
  return (
    artist || {
      artworkGroups: [],
      artworkTypes: [],
      artworkLocations: [],
      mediumPresets: [],
      sizePresets: [],
    }
  );
}

// Deliberately not using a computed key (e.g. `select: { [field]: true }`)
// anywhere here — Prisma can't type that precisely against a variable field
// name, since it has to allow for every possible key on Artist including
// relations like `sites`, and TypeScript then refuses a plain `as string[]`
// cast. Writing out each field explicitly keeps everything properly typed.
// `siteId` is passed through only so the calling screen (reached via a
// particular site) revalidates correctly — it's not part of what's being
// updated.
async function updateList(
  artistId: string,
  siteId: string,
  field: SettingsField,
  next: string[]
) {
  switch (field) {
    case "artworkGroups":
      await db.artist.update({ where: { id: artistId }, data: { artworkGroups: next } });
      break;
    case "artworkTypes":
      await db.artist.update({ where: { id: artistId }, data: { artworkTypes: next } });
      break;
    case "artworkLocations":
      await db.artist.update({ where: { id: artistId }, data: { artworkLocations: next } });
      break;
    case "mediumPresets":
      await db.artist.update({ where: { id: artistId }, data: { mediumPresets: next } });
      break;
    case "sizePresets":
      await db.artist.update({ where: { id: artistId }, data: { sizePresets: next } });
      break;
  }
  revalidatePath(`/sites/${siteId}/artworks/settings`);
  revalidatePath(`/sites/${siteId}/artworks`);
}

export async function addSettingOption(
  artistId: string,
  siteId: string,
  field: SettingsField,
  formData: FormData
) {
  const value = (formData.get("value") as string)?.trim();
  if (!value) return;
  const settings = await getArtworkSettings(artistId);
  const current = settings[field].filter((v) => v.toLowerCase() !== value.toLowerCase());
  await updateList(artistId, siteId, field, [...current, value]);
}

export async function removeSettingOption(
  artistId: string,
  siteId: string,
  field: SettingsField,
  value: string
) {
  const settings = await getArtworkSettings(artistId);
  const current = settings[field].filter((v) => v !== value);
  await updateList(artistId, siteId, field, current);
}
