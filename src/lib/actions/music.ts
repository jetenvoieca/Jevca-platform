"use server";

import { requireArtistAccess } from "@/lib/currentUser";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { deleteFromR2, getPresignedUploadUrl, publicMediaUrl } from "@/lib/r2";
import { sanitizeFilename } from "@/lib/sanitizeFilename";
import { MUSIC_TYPES, type MusicTrackRow } from "@/lib/musicTracks";

// The artist's Music library (2026-10-16) — see MusicTrack in
// schema.prisma. Uploads go straight from the browser to R2 (like media):
// requestMusicUpload, then addMusicTrack once the file is there.

function toRow(t: { id: string; name: string; key: string; durationSeconds: number | null }): MusicTrackRow {
  // Straight from storage — a large file can't go through the app.
  return { id: t.id, name: t.name, url: publicMediaUrl(t.key) || `/api/media/${t.key}`, durationSeconds: t.durationSeconds };
}

export async function listMusic(artistId: string): Promise<MusicTrackRow[]> {
  await requireArtistAccess(artistId);
  const tracks = await db.musicTrack.findMany({ where: { artistId }, orderBy: { name: "asc" } });
  return tracks.map(toRow);
}

export async function requestMusicUpload(
  artistId: string,
  filename: string,
  contentType: string
): Promise<{ uploadUrl: string; key: string } | { error: string }> {
  await requireArtistAccess(artistId);
  if (!MUSIC_TYPES.includes(contentType)) return { error: "Music must be an MP3, M4A or WAV file." };
  const key = `${artistId}/music/${randomUUID()}-${sanitizeFilename(filename)}`;
  return { uploadUrl: await getPresignedUploadUrl(key, contentType), key };
}

export async function addMusicTrack(
  artistId: string,
  upload: { key: string; name: string; mimeType: string; durationSeconds: number | null }
): Promise<MusicTrackRow | { error: string }> {
  await requireArtistAccess(artistId);
  if (!upload.key.startsWith(`${artistId}/music/`)) return { error: "That upload doesn't belong here." };
  if (!MUSIC_TYPES.includes(upload.mimeType)) return { error: "Music must be an MP3, M4A or WAV file." };
  const track = await db.musicTrack.create({
    data: {
      artistId,
      key: upload.key,
      name: upload.name.trim() || "Untitled track",
      mimeType: upload.mimeType,
      durationSeconds: upload.durationSeconds,
    },
  });
  return toRow(track);
}

export async function renameMusicTrack(artistId: string, id: string, name: string): Promise<void> {
  await requireArtistAccess(artistId);
  const trimmed = name.trim();
  if (!trimmed) return;
  await db.musicTrack.updateMany({ where: { id, artistId }, data: { name: trimmed } });
}

// Deleted with its file. A video still in Video Edit that used it simply
// loses its music.
export async function deleteMusicTrack(artistId: string, id: string): Promise<void> {
  await requireArtistAccess(artistId);
  const track = await db.musicTrack.findFirst({ where: { id, artistId } });
  if (!track) return;
  await db.musicTrack.delete({ where: { id } });
  await deleteFromR2(track.key).catch(() => {});
}
