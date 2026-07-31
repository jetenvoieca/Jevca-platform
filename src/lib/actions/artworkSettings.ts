"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type SettingsField =
  | "artworkGroups"
  | "artworkTypes"
  | "artworkLocations"
  | "mediumPresets"
  | "sizePresets";

export async function getArtworkSettings(siteId: string) {
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: {
      artworkGroups: true,
      artworkTypes: true,
      artworkLocations: true,
      mediumPresets: true,
      sizePresets: true,
    },
  });
  return (
    site || {
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
// name, since it has to allow for every possible key on Site including
// relations like `menus`, and TypeScript then refuses a plain `as string[]`
// cast. Writing out each field explicitly keeps everything properly typed.
async function updateList(siteId: string, field: SettingsField, next: string[]) {
  switch (field) {
    case "artworkGroups":
      await db.site.update({ where: { id: siteId }, data: { artworkGroups: next } });
      break;
    case "artworkTypes":
      await db.site.update({ where: { id: siteId }, data: { artworkTypes: next } });
      break;
    case "artworkLocations":
      await db.site.update({ where: { id: siteId }, data: { artworkLocations: next } });
      break;
    case "mediumPresets":
      await db.site.update({ where: { id: siteId }, data: { mediumPresets: next } });
      break;
    case "sizePresets":
      await db.site.update({ where: { id: siteId }, data: { sizePresets: next } });
      break;
  }
  revalidatePath(`/sites/${siteId}/artworks/settings`);
  revalidatePath(`/sites/${siteId}/artworks`);
}

export async function addSettingOption(
  siteId: string,
  field: SettingsField,
  formData: FormData
) {
  const value = (formData.get("value") as string)?.trim();
  if (!value) return;
  const settings = await getArtworkSettings(siteId);
  const current = settings[field].filter((v) => v.toLowerCase() !== value.toLowerCase());
  await updateList(siteId, field, [...current, value]);
}

export async function removeSettingOption(siteId: string, field: SettingsField, value: string) {
  const settings = await getArtworkSettings(siteId);
  const current = settings[field].filter((v) => v !== value);
  await updateList(siteId, field, current);
}
