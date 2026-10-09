import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Encrypts secrets the app has to keep, such as the Gmail permission
// (2026-10-09), so a copy of the database alone can't be used. AES-256-GCM
// with a key made from TOKEN_ENCRYPTION_KEY, set in Netlify — any long
// random string. Changing that key makes anything already stored
// unreadable (Gmail would then just need connecting again).
// Server-only.

function key(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("Missing TOKEN_ENCRYPTION_KEY — set it in Netlify first.");
  return createHash("sha256").update(secret).digest();
}

// "iv.tag.ciphertext", each base64.
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(stored: string): string {
  const [iv, tag, data] = stored.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
