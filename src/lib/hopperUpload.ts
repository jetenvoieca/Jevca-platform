import { postJson } from "@/lib/postJson";
import { putToR2 } from "@/lib/putToR2";

// What the Studio app can attach to a photo on its way to the Hopper —
// the same optional fields /api/hopper/finalize accepts. Anything left
// out or blank is simply not saved.
export type HopperDetails = {
  caption?: string;
  description?: string;
  artworkSize?: string;
  artworkPrice?: string;
  artworkType?: string;
  artworkLocation?: string;
};

// Sends one photo to an artist's Hopper using their own hopperToken —
// the same two-step route the iPhone Shortcut uses (see
// src/app/api/hopper/*): ask for an upload URL, PUT the file straight to
// R2, then create the Hopper item. Throws with a readable message on any
// failure.
export async function sendToHopper(
  token: string,
  file: File,
  source: string,
  details: HopperDetails = {}
) {
  const step1 = await postJson<{ uploadUrl: string; key: string; kind: "PHOTO" | "VIDEO" }>(
    "/api/hopper/request-upload",
    { token, filename: file.name || "photo", contentType: file.type }
  );

  await putToR2(step1.uploadUrl, file, file.type);

  await postJson("/api/hopper/finalize", {
    token,
    key: step1.key,
    contentType: file.type,
    kind: step1.kind,
    source,
    ...details,
  });
}
