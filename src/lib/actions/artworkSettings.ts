"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireArtistAccess } from "@/lib/currentUser";
import { readArtworkSettings } from "@/lib/artworkSettingsData";

export type SettingsField =
  | "mediumPresets"
  | "sizePresets"
  | "saleSources"
  | "paymentMethods";

// The client's artwork settings — see readArtworkSettings.
export async function getArtworkSettings(artistId: string) {
  await requireArtistAccess(artistId);
  return readArtworkSettings(artistId);
}

// ---------- Types — its own small set of actions (name + Ref value) ----------

function clampRefValue(raw: string | null | undefined): number {
  let v = parseFloat(raw || "1");
  if (Number.isNaN(v)) v = 1;
  return Math.min(2, Math.max(0.5, v));
}

export async function addArtworkType(artistId: string, siteId: string, formData: FormData) {
  await requireArtistAccess(artistId);
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
  await requireArtistAccess(artistId);
  const refValue = clampRefValue(refValueRaw);
  await db.artworkType.updateMany({ where: { id: typeId, artistId }, data: { refValue } });
  revalidatePath(`/sites/${siteId}/artworks/settings`);
  revalidatePath(`/sites/${siteId}/artworks`);
}

export async function removeArtworkType(artistId: string, siteId: string, typeId: string) {
  await requireArtistAccess(artistId);
  await db.artworkType.deleteMany({ where: { id: typeId, artistId } });
  revalidatePath(`/sites/${siteId}/artworks/settings`);
  revalidatePath(`/sites/${siteId}/artworks`);
}

// The three Payments defaults are single values, not preset lists, so they
// don't fit updateList/addSettingOption/removeSettingOption above — a
// small dedicated action instead. Card itself lives on the site's own
// Financial settings tab (SiteSettingsPanel), not here — moved 2026-09-07,
// these are financial terms rather than Catalogue/Type data — but stays
// in this file since it's still the same Artist-level settings concept
// as everything else here.
export async function updatePaymentDefaults(artistId: string, siteId: string, formData: FormData) {
  await requireArtistAccess(artistId);
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

  revalidatePath(`/sites/${siteId}`);
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
    case "mediumPresets":
      await db.artist.update({ where: { id: artistId }, data: { mediumPresets: next } });
      break;
    case "sizePresets":
      await db.artist.update({ where: { id: artistId }, data: { sizePresets: next } });
      break;
    case "saleSources":
      await db.artist.update({ where: { id: artistId }, data: { saleSources: next } });
      break;
    case "paymentMethods":
      await db.artist.update({ where: { id: artistId }, data: { paymentMethods: next } });
      break;
  }
  revalidatePath(`/sites/${siteId}/artworks/settings`);
  revalidatePath(`/sites/${siteId}/artworks`);
  // Payment methods are also offered on the Galleries page's "Mark as
  // paid" form, not just the Artwork Catalogue's Settings screen
  // (2026-09-03) — that route is already force-dynamic (see the note in
  // GalleriesView/payments.ts), so nothing further is needed there, but
  // revalidating it here keeps this consistent with every other
  // settings-touching action in this file.
  if (field === "paymentMethods") {
    revalidatePath(`/sites/${siteId}/galleries`);
  }
}

export async function addSettingOption(
  artistId: string,
  siteId: string,
  field: SettingsField,
  formData: FormData
) {
  await requireArtistAccess(artistId);
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
  await requireArtistAccess(artistId);
  const settings = await getArtworkSettings(artistId);
  const current = settings[field].filter((v) => v !== value);
  await updateList(artistId, siteId, field, current);
}
