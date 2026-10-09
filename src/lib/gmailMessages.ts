import { GMAIL_API, getGmailAccessToken } from "@/lib/gmail";
import { readableEmailText } from "@/lib/emailText";
import { personalAttachmentUrl } from "@/lib/gmailAttachmentUrl";

// Reading Craig's Gmail for the Inbox's Personal tab (2026-10-09, step 2).
// Everything is read live from Gmail on demand — nothing is stored here.
// Server-only.

export class GmailNotConnectedError extends Error {
  constructor() {
    super("Gmail isn't connected, or its access was withdrawn. Connect it again.");
  }
}

// Which list: Craig's choice — the Primary inbox only (no Promotions,
// Social or Updates), and the Sent folder. Both only the last 7 days
// (Craig's choice, 2026-10-09 — live issues only; older mail is in Gmail).
export type PersonalBox = "INBOX" | "SENT";
const BOX_QUERY: Record<PersonalBox, string> = {
  INBOX: "in:inbox category:primary newer_than:7d",
  SENT: "in:sent newer_than:7d",
};
// At most this many conversations per list, so it stays quick.
const LIST_LIMIT = 50;
// Gmail allows each account so many requests a second, so a page of
// conversations is fetched this many at a time rather than all at once.
const FETCH_CHUNK = 8;

export async function gmailFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getGmailAccessToken();
  if (!token) throw new GmailNotConnectedError();
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) throw new GmailNotConnectedError();
  if (!res.ok) throw new Error(`Gmail didn't respond (${res.status}). Please try again.`);
  return (await res.json()) as T;
}

type Header = { name: string; value: string };
type Part = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Header[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: Part[];
};
type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: Part;
};
type GmailThread = { id: string; messages?: GmailMessage[] };

function header(part: Part | undefined, name: string): string {
  const lower = name.toLowerCase();
  return part?.headers?.find((h) => h.name.toLowerCase() === lower)?.value ?? "";
}

// "Jane Smith <jane@x.com>" → name and address.
function parseAddress(raw: string): { name: string | null; address: string } {
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m) return { name: m[1].trim() || null, address: m[2].trim() };
  return { name: null, address: raw.trim() };
}

// The HTML entities Gmail's snippets come with.
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export type PersonalMailItem = {
  threadId: string;
  // The other party: the sender on the Inbox list, the recipient on Sent.
  name: string | null;
  address: string;
  subject: string;
  snippet: string;
  at: string; // ISO
  unread: boolean;
  count: number; // messages in the conversation
};

// The list's conversations, newest first.
export async function listPersonalMail(box: PersonalBox): Promise<PersonalMailItem[]> {
  const params = new URLSearchParams({ q: BOX_QUERY[box], maxResults: String(LIST_LIMIT) });
  const list = await gmailFetch<{ threads?: { id: string }[] }>(`/threads?${params}`);

  const ids = (list.threads ?? []).map((t) => t.id);
  const threads: GmailThread[] = [];
  const metadata = "format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject";
  for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
    threads.push(
      ...(await Promise.all(
        ids.slice(i, i + FETCH_CHUNK).map((id) => gmailFetch<GmailThread>(`/threads/${id}?${metadata}`))
      ))
    );
  }

  return threads.map((thread): PersonalMailItem => {
    const messages = thread.messages ?? [];
    // The latest message of the conversation that belongs to this list —
    // the latest received one for the Inbox, the latest sent one for Sent.
    const inBox = messages.filter((m) => (box === "SENT" ? m.labelIds?.includes("SENT") : !m.labelIds?.includes("SENT")));
    const shown = inBox[inBox.length - 1] ?? messages[messages.length - 1];
    const party = parseAddress(header(shown?.payload, box === "SENT" ? "To" : "From"));
    return {
      threadId: thread.id,
      name: party.name,
      address: party.address,
      subject: header(messages[0]?.payload, "Subject"),
      snippet: decodeEntities(shown?.snippet ?? ""),
      at: new Date(Number(shown?.internalDate ?? 0)).toISOString(),
      unread: messages.some((m) => m.labelIds?.includes("UNREAD")),
      count: messages.length,
    };
  });
}

export type PersonalMailAttachment = {
  messageId: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type PersonalMailMessage = {
  id: string;
  fromName: string | null;
  fromAddress: string;
  to: string;
  cc: string;
  subject: string;
  at: string; // ISO
  sentByMe: boolean;
  htmlBody: string | null;
  textBody: string;
  attachments: PersonalMailAttachment[];
};

// A body part's text, in its own character set.
function decodeBody(part: Part): string {
  const bytes = Buffer.from(part.body?.data ?? "", "base64url");
  const charset = header(part, "Content-Type").match(/charset="?([^";\s]+)"?/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function readMessage(message: GmailMessage): PersonalMailMessage {
  let html: string | null = null;
  let text: string | null = null;
  const attachments: PersonalMailAttachment[] = [];
  // Inline images (cid:…) in the HTML, pointed at the attachment route.
  const inline = new Map<string, string>();

  const walk = (part: Part) => {
    const mimeType = (part.mimeType ?? "").toLowerCase();
    const attachmentId = part.body?.attachmentId;
    if (attachmentId) {
      const file = {
        messageId: message.id,
        attachmentId,
        filename: part.filename || "attachment",
        mimeType: mimeType || "application/octet-stream",
      };
      const contentId = header(part, "Content-ID").replace(/^<|>$/g, "");
      if (contentId) inline.set(contentId, personalAttachmentUrl(file));
      if (part.filename) attachments.push({ ...file, size: part.body?.size ?? 0 });
    } else if (mimeType === "text/html" && html === null && part.body?.data) {
      html = decodeBody(part);
    } else if (mimeType === "text/plain" && text === null && part.body?.data) {
      text = decodeBody(part);
    }
    part.parts?.forEach(walk);
  };
  if (message.payload) walk(message.payload);

  const htmlBody = html
    ? (html as string).replace(/cid:([^"'\s)>]+)/gi, (whole, id: string) => inline.get(id) ?? whole)
    : null;
  const from = parseAddress(header(message.payload, "From"));
  return {
    id: message.id,
    fromName: from.name,
    fromAddress: from.address,
    to: header(message.payload, "To"),
    cc: header(message.payload, "Cc"),
    subject: header(message.payload, "Subject"),
    at: new Date(Number(message.internalDate ?? 0)).toISOString(),
    sentByMe: !!message.labelIds?.includes("SENT"),
    htmlBody,
    textBody: readableEmailText(text, htmlBody),
    attachments,
  };
}

// A whole conversation, oldest first — and, Craig's choice, marked read
// in Gmail too.
export async function openPersonalThread(threadId: string): Promise<PersonalMailMessage[]> {
  const thread = await gmailFetch<GmailThread>(`/threads/${encodeURIComponent(threadId)}?format=full`);
  const messages = thread.messages ?? [];
  if (messages.some((m) => m.labelIds?.includes("UNREAD"))) {
    await gmailFetch(`/threads/${encodeURIComponent(threadId)}/modify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
    });
  }
  return messages.map(readMessage);
}

// One attachment's file.
export async function getPersonalAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const res = await gmailFetch<{ data?: string }>(
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`
  );
  return Buffer.from(res.data ?? "", "base64url");
}
