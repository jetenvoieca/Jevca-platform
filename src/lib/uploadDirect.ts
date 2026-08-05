import { requestUploadUrl, finalizeUpload } from "@/lib/actions/media";
import { generateVideoThumbnail } from "@/lib/videoThumbnail";

async function putToR2(uploadUrl: string, body: File | Blob, contentType: string) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    body,
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) {
    throw new Error(`Upload to storage failed (status ${res.status}).`);
  }
}

// Two tiny server calls bookending a direct browser-to-R2 upload — see
// requestUploadUrl/finalizeUpload in actions/media.ts for why this exists
// instead of sending the file through a server action. For videos, also
// grabs a still frame client-side and uploads that alongside as the
// catalogue thumbnail.
//
// status/source default to exactly today's behaviour (SORTED, no source)
// so every existing caller — MediaPicker, MediaCatalogueView — is
// unaffected. The Hopper's "Add from folder"/"Add media" buttons are the
// only callers that pass status: "HOPPER".
export async function uploadFileDirect(
  file: File,
  artistId: string,
  status: "SORTED" | "HOPPER" = "SORTED",
  source?: string
) {
  const step1 = await requestUploadUrl(artistId, file.name, file.type);
  if ("error" in step1) {
    throw new Error(step1.error);
  }

  await putToR2(step1.uploadUrl, file, file.type);

  let posterUrl: string | undefined;
  if (step1.kind === "VIDEO") {
    try {
      const thumbBlob = await generateVideoThumbnail(file);
      const posterStep = await requestUploadUrl(
        artistId,
        `${file.name}-poster.jpg`,
        "image/jpeg"
      );
      if (!("error" in posterStep)) {
        await putToR2(posterStep.uploadUrl, thumbBlob, "image/jpeg");
        posterUrl = `/api/media/${posterStep.key}`;
      }
    } catch {
      // If thumbnail generation fails for any reason (unusual codec, a
      // browser that won't decode this particular file, etc.) the video
      // still uploads fine — it just falls back to the plain "Video"
      // placeholder instead of a still frame.
    }
  }

  const step2 = await finalizeUpload(
    artistId,
    step1.key,
    file.type,
    step1.kind,
    posterUrl,
    status,
    source
  );
  return step2.image;
}
