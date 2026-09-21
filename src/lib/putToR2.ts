// Direct browser-to-R2 upload of one file to a presigned URL — the URL
// comes from requestUploadUrl (actions/media.ts) or, for token-based
// callers like the Studio app, /api/hopper/request-upload.
export async function putToR2(uploadUrl: string, body: File | Blob, contentType: string) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    body,
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) {
    throw new Error(`Upload to storage failed (status ${res.status}).`);
  }
}
