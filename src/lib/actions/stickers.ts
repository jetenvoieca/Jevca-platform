"use server";

import { requireArtistAccess } from "@/lib/currentUser";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { deleteFromR2, getPresignedUploadUrl, publicMediaUrl } from "@/lib/r2";
import { sanitizeFilename } from "@/lib/sanitizeFilename";
import type { StickerRow } from "@/lib/stickers";

// The artist's Stickers library (2026-10-16) — see Sticker in
// schema.prisma. PNGs, uploaded straight from the browser to R2:
// requestStickerUpload, then addSticker once the file is there.

function toRow(s: { id: string; name: string; key: string }): StickerRow {
  return { id: s.id, name: s.name, url: publicMediaUrl(s.key) || `/api/media/${s.key}` };
}

export async function listStickers(artistId: string): Promise<StickerRow[]> {
  await requireArtistAccess(artistId);
  const stickers = await db.sticker.findMany({ where: { artistId }, orderBy: { name: "asc" } });
  return stickers.map(toRow);
}

export async function requestStickerUpload(
  artistId: string,
  filename: string,
  contentType: string
): Promise<{ uploadUrl: string; key: string } | { error: string }> {
  await requireArtistAccess(artistId);
  if (contentType !== "image/png") return { error: "A sticker must be a PNG file." };
  const key = `${artistId}/stickers/${randomUUID()}-${sanitizeFilename(filename)}`;
  return { uploadUrl: await getPresignedUploadUrl(key, contentType), key };
}

export async function addSticker(
  artistId: string,
  upload: { key: string; name: string }
): Promise<StickerRow | { error: string }> {
  await requireArtistAccess(artistId);
  if (!upload.key.startsWith(`${artistId}/stickers/`)) return { error: "That upload doesn't belong here." };
  const sticker = await db.sticker.create({
    data: { artistId, key: upload.key, name: upload.name.trim() || "Sticker" },
  });
  return toRow(sticker);
}

export async function renameSticker(artistId: string, id: string, name: string): Promise<void> {
  await requireArtistAccess(artistId);
  const trimmed = name.trim();
  if (!trimmed) return;
  await db.sticker.updateMany({ where: { id, artistId }, data: { name: trimmed } });
}

// Deleted with its file. Clips in Video Edit that used it simply lose it.
export async function deleteSticker(artistId: string, id: string): Promise<void> {
  await requireArtistAccess(artistId);
  const sticker = await db.sticker.findFirst({ where: { id, artistId } });
  if (!sticker) return;
  await db.sticker.delete({ where: { id } });
  await deleteFromR2(sticker.key).catch(() => {});
}
