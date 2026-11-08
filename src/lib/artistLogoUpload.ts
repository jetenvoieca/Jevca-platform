"use client";

import { saveArtistLogo } from "@/lib/actions";
import { requestUploadUrl } from "@/lib/actions/media";
import { seeThroughPicture } from "@/lib/seeThroughPicture";

// Uploads a client's Logo (shared 2026-11-08 by the site's Personal
// Profile and the Artist App's Profile window). It's made see-through
// first (2026-10-22): a white background taken out and empty edges
// trimmed (lib/seeThroughPicture.ts); a drawing (SVG) already
// see-through goes up as it is. Straight to storage, then saved as the
// client's logo. Returns what went wrong, or null.
export async function uploadArtistLogo(artistId: string, file: File): Promise<string | null> {
  let picture: Blob;
  try {
    picture = await seeThroughPicture(file, { svgScale: 3 });
  } catch (err) {
    return `That logo ${err instanceof Error ? err.message : "couldn't be read."}`;
  }
  const type = picture.type || file.type;
  const name = picture === file ? file.name : file.name.replace(/\.[^.]+$/, "") + ".png";
  const result = await requestUploadUrl(artistId, name, type);
  if ("error" in result) return result.error ?? "Upload failed — please try again.";
  const putRes = await fetch(result.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": type },
    body: picture,
  });
  if (!putRes.ok) return "Upload failed — please try again.";
  await saveArtistLogo(artistId, result.key);
  return null;
}
