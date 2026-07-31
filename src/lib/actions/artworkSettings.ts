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

// Shared add/remove for all five preset lists — each is just a plain string
// array on Site, so the only real work is reading the current array,
// changing it, and writing it back.
async function updateList(siteId: string, field: SettingsField, next: string[]) {
  await db.site.update({
    where: { id: siteId },
    data: { [field]: next },
  });
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
  const site = await db.site.findUnique({ where: { id: siteId }, select: { [field]: true } });
  const current = ((site?.[field] as string[]) || []).filter(
    (v) => v.toLowerCase() !== value.toLowerCase()
  );
  await updateList(siteId, field, [...current, value]);
}

export async function removeSettingOption(siteId: string, field: SettingsField, value: string) {
  const site = await db.site.findUnique({ where: { id: siteId }, select: { [field]: true } });
  const current = ((site?.[field] as string[]) || []).filter((v) => v !== value);
  await updateList(siteId, field, current);
}
