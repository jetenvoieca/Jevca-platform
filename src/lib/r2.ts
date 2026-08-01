import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
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
