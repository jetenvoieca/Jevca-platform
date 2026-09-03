"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

// Certificate of Authenticity templates — one per artwork Type-ish
// category (Original / Unique / Edition, etc.), matched against
// Artwork.type the same free-text way ArtworkType is (2026-09-03). Kept
// in its own small action file rather than folded into
// artworkSettings.ts, since these aren't Artwork Catalogue settings —
// they live on the Financial tab of the artist's own Settings screen
// (SiteSettingsPanel), alongside Invoicing.

export type CertificateTemplateRow = {
  id: string;
  label: string;
  text: string;
};

export async function getCertificateTemplates(artistId: string): Promise<CertificateTemplateRow[]> {
  const rows = await db.certificateTemplate.findMany({
    where: { artistId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ id: r.id, label: r.label, text: r.text }));
}

export async function addCertificateTemplate(
  artistId: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const label = (formData.get("label") as string)?.trim();
  const text = (formData.get("text") as string)?.trim();
  if (!label) return { ok: false, error: "A label is required." };
  if (!text) return { ok: false, error: "The certifying text is required." };

  await db.certificateTemplate.create({ data: { artistId, label, text } });
  revalidatePath(`/sites/${siteId}`);
  return { ok: true };
}

export async function updateCertificateTemplate(
  id: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const label = (formData.get("label") as string)?.trim();
  const text = (formData.get("text") as string)?.trim();
  if (!label) return { ok: false, error: "A label is required." };
  if (!text) return { ok: false, error: "The certifying text is required." };

  await db.certificateTemplate.update({ where: { id }, data: { label, text } });
  revalidatePath(`/sites/${siteId}`);
  return { ok: true };
}

export async function removeCertificateTemplate(id: string, siteId: string): Promise<void> {
  await db.certificateTemplate.delete({ where: { id } });
  revalidatePath(`/sites/${siteId}`);
}
