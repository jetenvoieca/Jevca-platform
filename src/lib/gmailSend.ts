import {
  gmailFetch,
  header,
  parseAddress,
  readMessage,
  getPersonalAttachment,
  type GmailMessage,
  type GmailThread,
} from "@/lib/gmailMessages";
import { formatDateTime } from "@/lib/formatDate";

// Replying and forwarding from Craig's Gmail, for the Inbox's Personal tab
// (2026-10-09, step 3). Sent through Gmail itself, so it lands in his
// Gmail Sent folder and stays in the conversation, from his Gmail's
// default "send as" address (craig@isendyouthis.com) — the same one Gmail
// uses. Server-only.

const UPLOAD_SEND_URL = "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SendResult = { ok: true } | { ok: false; error: string };

// The Gmail's default "send as" address, as "Name <address>".
async function fromAddress(): Promise<string> {
  const res = await gmailFetch<{
    sendAs?: { sendAsEmail: string; displayName?: string; isDefault?: boolean }[];
  }>("/settings/sendAs");
  const alias = res.sendAs?.find((a) => a.isDefault) ?? res.sendAs?.[0];
  if (!alias) throw new Error("Couldn't find the Gmail account's sending address.");
  return alias.displayName ? `${encodeWord(alias.displayName)} <${alias.sendAsEmail}>` : alias.sendAsEmail;
}

// A header value with anything beyond plain ASCII encoded (RFC 2047).
function encodeWord(text: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function base64Lines(data: Buffer): string {
  return data.toString("base64").replace(/.{1,76}/g, "$&\r\n");
}

type Attachment = { filename: string; mimeType: string; data: Buffer };

// The raw email: headers, a plain-text body and any attachments.
function buildEmail(headers: Record<string, string>, body: string, attachments: Attachment[] = []): string {
  const lines = Object.entries(headers)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`);
  lines.push("MIME-Version: 1.0");
  const textPart = [
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(body, "utf8")),
  ].join("\r\n");

  if (attachments.length === 0) return [...lines, textPart].join("\r\n");

  const boundary = `jevca-${crypto.randomUUID()}`;
  const parts = [
    textPart,
    ...attachments.map((a) =>
      [
        `Content-Type: ${a.mimeType}; name="${encodeWord(a.filename)}"`,
        `Content-Disposition: attachment; filename="${encodeWord(a.filename)}"`,
        "Content-Transfer-Encoding: base64",
        "",
        base64Lines(a.data),
      ].join("\r\n")
    ),
  ];
  return [
    ...lines,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    ...parts.map((p) => `--${boundary}\r\n${p}`),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

// Sends through Gmail (the upload address, so attachments up to Gmail's
// own size limit fit), into the conversation when `threadId` is given.
async function send(raw: string, threadId?: string): Promise<void> {
  const boundary = `jevca-upload-${crypto.randomUUID()}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(threadId ? { threadId } : {}),
    `--${boundary}`,
    "Content-Type: message/rfc822",
    "",
    raw,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  await gmailFetch(UPLOAD_SEND_URL, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
}

// The earlier email, quoted under a reply or forward.
function quote(text: string): string {
  return text
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
}

function withPrefix(prefix: string, subject: string): string {
  return new RegExp(`^${prefix}:`, "i").test(subject.trim()) ? subject.trim() : `${prefix}: ${subject.trim()}`;
}

// Replies to the latest email in a conversation — to whoever sent it (its
// Reply-To if it has one), or, if Craig sent the latest one, to the same
// people again — quoting it underneath, as Gmail does.
export async function replyToPersonalThread(threadId: string, body: string): Promise<SendResult> {
  const text = body.trim();
  if (!text) return { ok: false, error: "Write your reply first." };

  const thread = await gmailFetch<GmailThread>(`/threads/${encodeURIComponent(threadId)}?format=full`);
  const messages = thread.messages ?? [];
  const last = messages[messages.length - 1];
  if (!last) return { ok: false, error: "This conversation couldn't be found in Gmail." };

  const sentByMe = !!last.labelIds?.includes("SENT");
  const to = sentByMe ? header(last.payload, "To") : header(last.payload, "Reply-To") || header(last.payload, "From");
  if (!to) return { ok: false, error: "This email has no address to reply to." };

  const read = readMessage(last);
  const messageId = header(last.payload, "Message-ID");
  const references = [header(last.payload, "References"), messageId].filter(Boolean).join(" ");
  const sender = read.fromName ? `${read.fromName} <${read.fromAddress}>` : read.fromAddress;
  const raw = buildEmail(
    {
      From: await fromAddress(),
      To: to,
      Subject: encodeWord(withPrefix("Re", header(last.payload, "Subject"))),
      "In-Reply-To": messageId,
      References: references,
    },
    `${text}\n\nOn ${formatDateTime(read.at)}, ${sender} wrote:\n${quote(read.textBody)}\n`
  );
  await send(raw, threadId);
  return { ok: true };
}

// Forwards one email, with its attachments, to one or more addresses
// (separated by commas), with an optional note above it.
export async function forwardPersonalMessage(messageId: string, toRaw: string, note: string): Promise<SendResult> {
  const recipients = toRaw
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter(Boolean);
  if (recipients.length === 0) return { ok: false, error: "Enter an address to forward to." };
  const wrong = recipients.find((a) => !EMAIL_PATTERN.test(a));
  if (wrong) return { ok: false, error: `"${wrong}" doesn't look like an email address.` };

  const message = await gmailFetch<GmailMessage>(`/messages/${encodeURIComponent(messageId)}?format=full`);
  const read = readMessage(message);
  const attachments: Attachment[] = [];
  for (const a of read.attachments) {
    attachments.push({
      filename: a.filename,
      mimeType: a.mimeType,
      data: await getPersonalAttachment(a.messageId, a.attachmentId),
    });
  }

  const forwarded = [
    "---------- Forwarded message ---------",
    `From: ${read.fromName ? `${read.fromName} <${read.fromAddress}>` : read.fromAddress}`,
    `Date: ${formatDateTime(read.at)}`,
    `Subject: ${read.subject}`,
    `To: ${read.to}`,
    ...(read.cc ? [`Cc: ${read.cc}`] : []),
    "",
    read.textBody,
  ].join("\n");
  const raw = buildEmail(
    {
      From: await fromAddress(),
      To: recipients.join(", "),
      Subject: encodeWord(withPrefix("Fwd", read.subject)),
    },
    note.trim() ? `${note.trim()}\n\n${forwarded}\n` : `${forwarded}\n`,
    attachments
  );
  await send(raw);
  return { ok: true };
}

// The address replies and forwards go out from — shown in the tab.
export async function personalSendingAddress(): Promise<string> {
  return parseAddress(await fromAddress()).address;
}
