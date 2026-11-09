"use client";

import { finalizeUpload, requestUploadUrl } from "@/lib/actions/media";

// A picture chosen from the device, uploaded straight into the client's
// media as sorted (2026-11-09, the Artist App's Portfolio level — not
// through the Hopper): to storage, then recorded. Returns its Image id,
// or what went wrong.
export async function uploadPicture(artistId: string, file: File): Promise<{ imageId: string } | { error: string }> {
  if (!file.type.startsWith("image/")) return { error: "Choose a picture." };
  const target = await requestUploadUrl(artistId, file.name, file.type);
  if ("error" in target) return { error: target.error ?? "Upload failed — please try again." };
  const put = await fetch(target.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!put.ok) return { error: "Upload failed — please try again." };
  try {
    const { image } = await finalizeUpload(artistId, target.key, file.type, "PHOTO", { rejectUnreadable: true });
    return { imageId: image.id };
  } catch (err) {
    return { error: err instanceof Error && err.message ? err.message : "That picture couldn't be used." };
  }
}
