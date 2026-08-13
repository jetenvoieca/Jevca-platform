import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = process.env.R2_ACCOUNT_ID!;
const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;

export const R2_BUCKET = process.env.R2_BUCKET_NAME || "jevca-media";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

export async function uploadToR2(key: string, body: Buffer, contentType: string) {
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function getFromR2(key: string) {
  return r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}

// Permanently removes a file from R2. Used where "delete" genuinely means
// delete — discarding a render result, or cleaning up a one-time-use
// temporary asset — as opposed to the Archive pattern used elsewhere in
// this app for things that should stay recoverable.
export async function deleteFromR2(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}

// A short-lived URL the browser can PUT a file straight to, bypassing
// Netlify's Function payload ceiling entirely (that limit only applies to
// requests that actually reach a Function — this one goes directly to R2).
export async function getPresignedUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2, command, { expiresIn: 300 });
}

// Builds a public, directly-loadable URL for an object in the bucket —
// used for thumbnail/display image sizes (2026-08-13), which are served
// straight from R2 rather than proxied through a server function, so
// they load fast and don't tie up a function invocation per image.
//
// The domain lives in exactly one place (this function) on purpose: it's
// currently R2's own free public dev URL (R2_PUBLIC_URL env var), and the
// plan is to move to a proper custom domain once that's set up — at
// which point only this one env var changes, nothing else in the app.
export function publicMediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const base = process.env.R2_PUBLIC_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/${key}`;
}
