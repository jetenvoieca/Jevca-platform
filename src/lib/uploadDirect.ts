import { requestUploadUrl, finalizeUpload } from "@/lib/actions/media";

// Two tiny server calls bookending a direct browser-to-R2 upload — see
// requestUploadUrl/finalizeUpload in actions/media.ts for why this exists
// instead of sending the file through a server action.
export async function uploadFileDirect(file: File, artistId: string) {
  const step1 = await requestUploadUrl(artistId, file.name, file.type);
  if ("error" in step1) {
    throw new Error(step1.error);
  }

  const putRes = await fetch(step1.uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!putRes.ok) {
    throw new Error(`Upload to storage failed (status ${putRes.status}).`);
  }

  const step2 = await finalizeUpload(artistId, step1.key, file.type, step1.kind);
  return step2.image;
}
