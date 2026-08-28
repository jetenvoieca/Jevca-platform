"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type SettingsField =
  | "artworkGroups"
  | "artworkLocations"
  | "mediumPresets"
  | "sizePresets"
  | "saleSources";

// These presets belong to the Artist now (same reasoning as Artwork
// ownership) — shared across all of that artist's sites, not duplicated
// per site.
//
// Types moved off this plain-string-list mechanism entirely (2026-08-28)
// — a real Type now carries a numeric Ref value (see ArtworkType in
// schema.prisma), which addSettingOption/removeSettingOption below have
// nowhere to hold. `artworkTypes` here stays a plain string[] of just
// the names, for the several places that only ever needed a name to
// populate a dropdown/filter (HopperView, ArtworksCatalogueView) —
// `artworkTypeRecords` alongside it carries the full {id, name,
// refValue} shape for the Settings screen and the Catalogue tab's
// Reference price calculation.
export async function getArtworkSettings(artistId: string) {
  const [artist, artworkTypeRows] = await Promise.all([
    db.artist.findUnique({
      where: { id: artistId },
      select: {
        artworkGroups: true,
        artworkLocations: true,
        mediumPresets: true,
        sizePresets: true,
        saleSources: true,
        defaultInstalmentCount: true,
        defaultReleaseMessage: true,
        defaultReleaseTriggerCount: true,
      },
    }),
    db.artworkType.findMany({ where: { artistId }, orderBy: { name: "asc" } }),
  ]);

  return {
    artworkGroups: artist?.artworkGroups ?? [],
    artworkTypes: artworkTypeRows.map((t) => t.name),
    artworkTypeRecords: artworkTypeRows.map((t) => ({
      id: t.id,
      name: t.name,
      refValue: t.refValue.toString(),
    })),
    artworkLocations: artist?.artworkLocations ?? [],
    mediumPresets: artist?.mediumPresets ?? [],
    sizePresets: artist?.sizePresets ?? [],
    saleSources: artist?.saleSources ?? [],
    defaultInstalmentCount: artist?.defaultInstalmentCount ?? 5,
    defaultReleaseMessage:
      artist?.defaultReleaseMessage ??
      "Available for collection/delivery once 2 payments have been made.",
    defaultReleaseTriggerCount: artist?.defaultReleaseTriggerCount ?? 2,
  };
}

// ---------- Types — its own small set of actions (name + Ref value) ----------

function clampRefValue(raw: string | null | undefined): number {
  let v = parseFloat(raw || "1");
  if (Number.isNaN(v)) v = 1;
  return Math.min(2, Math.max(0.5, v));
}

export async function addArtworkType(artistId: string, siteId: string, formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;
  const refValue = clampRefValue(formData.get("refValue") as string);

  await db.artworkType.upsert({
    where: { artistId_name: { artistId, name } },
    create: { artistId, name, refValue },
    update: { refValue },
  });

  revalidatePath(`/sites/${siteId}/artworks/settings`);
  revalidatePath(`/sites/${siteId}/artworks`);
}

// Called on blur from the small Ref value box next to each existing
// Type (2026-08-28) — not part of the Add row, which only takes a name;
// a brand-new Type starts at the neutral default (1.00) and gets tuned
// here afterwards, same as everywhere else in this screen autosaves.
export async function updateArtworkTypeRefValue(
  artistId: string,
  siteId: string,
  typeId: string,
  refValueRaw: string
) {
  const refValue = clampRefValue(refValueRaw);
  await db.artworkType.update({ where: { id: typeId }, data: { refValue } });
  revalidatePath(`/sites/${siteId}/artworks/settings`);
  revalidatePath(`/sites/${siteId}/artworks`);
}

export async function removeArtworkType(artistId: string, siteId: string, typeId: string) {
  await db.artworkType.delete({ where: { id: typeId } });
  revalidatePath(`/sites/${siteId}/artworks/settings`);
  revalidatePath(`/sites/${siteId}/artworks`);
}

// The three Payments defaults are single values, not preset lists, so they
// don't fit updateList/addSettingOption/removeSettingOption above — a
// small dedicated action instead.
export async function updatePaymentDefaults(artistId: string, siteId: string, formData: FormData) {
  const defaultInstalmentCount = parseInt((formData.get("defaultInstalmentCount") as string) || "5", 10);
  const defaultReleaseMessage = (formData.get("defaultReleaseMessage") as string)?.trim() || "";
  const defaultReleaseTriggerCount = parseInt(
    (formData.get("defaultReleaseTriggerCount") as string) || "2",
    10
  );

  await db.artist.update({
    where: { id: artistId },
    data: { defaultInstalmentCount, defaultReleaseMessage, defaultReleaseTriggerCount },
  });

  revalidatePath(`/sites/${siteId}/artworks/settings`);
  revalidatePath(`/sites/${siteId}/artworks`);
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
    case "artworkLocations":
      await db.artist.update({ where: { id: artistId }, data: { artworkLocations: next } });
      break;
    case "mediumPresets":
      await db.artist.update({ where: { id: artistId }, data: { mediumPresets: next } });
      break;
    case "sizePresets":
      await db.artist.update({ where: { id: artistId }, data: { sizePresets: next } });
      break;
    case "saleSources":
      await db.artist.update({ where: { id: artistId }, data: { saleSources: next } });
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
