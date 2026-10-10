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

// Which list: the whole inbox (Craig's Gmail has no Primary/Promotions
// tabs, just one list) and the Sent folder — each only its latest emails
// (Craig's choice, 2026-10-09 — live issues only; older mail is in Gmail).
export type PersonalBox = "INBOX" | "SENT";
const BOX_QUERY: Record<PersonalBox, string> = {
  INBOX: "in:inbox",
  SENT: "in:sent",
};
// At most this many emails per list, fetched this many at a time (Gmail
// allows each account so many requests a second). Once Gmail has listed
// them, fetching their details stops after this long — a slow Gmail
// returns the emails fetched so far (always at least the first batch)
// rather than running into the server's own time limit.
const LIST_LIMIT = 50;
const FETCH_CHUNK = 10;
const FETCH_BUDGET_MS = 6000;

// Gmail's own explanation of a refused request: its message and reason
// (e.g. "rateLimitExceeded", "insufficientPermissions").
async function gmailError(res: Response): Promise<{ message: string; reason: string }> {
  try {
    const body = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[] } };
    return { message: body.error?.message ?? "", reason: body.error?.errors?.[0]?.reason ?? "" };
  } catch {
    return { message: "", reason: "" };
  }
}

// Gmail's "slow down" answers — 429, or 403 with one of these reasons.
const RATE_LIMIT_REASONS = ["rateLimitExceeded", "userRateLimitExceeded"];

// One request to Gmail — `path` is under the account's API address, or a
// full https:// address (the upload one, for sending). If Gmail asks to
// slow down or has a passing fault (5xx), it's tried once more a second
// later. A refusal shows Gmail's own explanation.
export async function gmailFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getGmailAccessToken();
  if (!token) throw new GmailNotConnectedError();
  const send = () =>
    fetch(path.startsWith("https://") ? path : `${GMAIL_API}${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

  let res = await send();
  let error = res.ok ? null : await gmailError(res);
  const passing =
    res.status === 429 || res.status >= 500 || (res.status === 403 && RATE_LIMIT_REASONS.includes(error?.reason ?? ""));
  if (passing) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await send();
    error = res.ok ? null : await gmailError(res);
  }

  if (res.status === 401) throw new GmailNotConnectedError();
  if (res.status === 429 || RATE_LIMIT_REASONS.includes(error?.reason ?? "")) {
    throw new Error("Gmail is busy — too many requests in the last minute. Wait a minute and try again.");
  }
  if (!res.ok) {
    const detail = [error?.message, error?.reason && `(${error.reason})`].filter(Boolean).join(" ");
    throw new Error(`Gmail refused (${res.status})${detail ? `: ${detail}` : ""}. Please try again.`);
  }
  return (await res.json()) as T;
}

type Header = { name: string; value: string };
export type Part = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Header[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: Part[];
};
export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: Part;
};
export type GmailThread = { id: string; messages?: GmailMessage[] };

export function header(part: Part | undefined, name: string): string {
  const lower = name.toLowerCase();
  return part?.headers?.find((h) => h.name.toLowerCase() === lower)?.value ?? "";
}

// "Jane Smith <jane@x.com>" → name and address.
export function parseAddress(raw: string): { name: string | null; address: string } {
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

// The list's conversations, newest first — built from its emails' headers
// only (one light request per email), grouped by conversation.
export async function listPersonalMail(box: PersonalBox): Promise<PersonalMailItem[]> {
  const params = new URLSearchParams({ q: BOX_QUERY[box], maxResults: String(LIST_LIMIT) });
  const list = await gmailFetch<{ messages?: { id: string }[] }>(`/messages?${params}`);
  const started = Date.now();

  const ids = (list.messages ?? []).map((m) => m.id);
  const query =
    "format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject" +
    "&fields=id,threadId,labelIds,snippet,internalDate,payload/headers";
  const messages: GmailMessage[] = [];
  for (let i = 0; i < ids.length && (i === 0 || Date.now() - started < FETCH_BUDGET_MS); i += FETCH_CHUNK) {
    messages.push(
      ...(await Promise.all(
        ids.slice(i, i + FETCH_CHUNK).map((id) => gmailFetch<GmailMessage>(`/messages/${id}?${query}`))
      ))
    );
  }

  // Newest first, so the first email seen of each conversation is its
  // latest one in this list.
  const byThread = new Map<string, { latest: GmailMessage; count: number; unread: boolean }>();
  for (const m of messages) {
    const entry = byThread.get(m.threadId);
    const unread = !!m.labelIds?.includes("UNREAD");
    if (entry) {
      entry.count += 1;
      entry.unread ||= unread;
    } else {
      byThread.set(m.threadId, { latest: m, count: 1, unread });
    }
  }

  return [...byThread.entries()].map(([threadId, { latest, count, unread }]): PersonalMailItem => {
    const party = parseAddress(header(latest.payload, box === "SENT" ? "To" : "From"));
    return {
      threadId,
      name: party.name,
      address: party.address,
      subject: header(latest.payload, "Subject"),
      snippet: decodeEntities(latest.snippet ?? ""),
      at: new Date(Number(latest.internalDate ?? 0)).toISOString(),
      unread,
      count,
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

export function readMessage(message: GmailMessage): PersonalMailMessage {
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

// The unread count on the Personal pill (2026-10-10, Craig's choice):
// unread conversations among the ones the inbox list shows — its latest
// LIST_LIMIT emails — not every unread email ever. Two light list
// requests (ids only), no email fetched.
export async function personalUnreadCount(): Promise<number> {
  type Ids = { messages?: { id: string; threadId: string }[] };
  const list = (q: string) =>
    gmailFetch<Ids>(`/messages?${new URLSearchParams({ q, maxResults: String(LIST_LIMIT) })}`);
  const [latest, unread] = await Promise.all([list(BOX_QUERY.INBOX), list(`${BOX_QUERY.INBOX} is:unread`)]);
  const shown = new Set((latest.messages ?? []).map((m) => m.id));
  return new Set((unread.messages ?? []).filter((m) => shown.has(m.id)).map((m) => m.threadId)).size;
}

// Archive, as in Gmail: takes a whole conversation out of the inbox; it
// stays in Gmail (All Mail).
export async function archivePersonalThread(threadId: string): Promise<void> {
  await gmailFetch(`/threads/${encodeURIComponent(threadId)}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
  });
}

// Delete, as in Gmail: moves a whole conversation, or one email of it, to
// Gmail's Bin, where it can still be recovered for 30 days.
export async function trashPersonalThread(threadId: string): Promise<void> {
  await gmailFetch(`/threads/${encodeURIComponent(threadId)}/trash`, { method: "POST" });
}

export async function trashPersonalMessage(messageId: string): Promise<void> {
  await gmailFetch(`/messages/${encodeURIComponent(messageId)}/trash`, { method: "POST" });
}

// One attachment's file.
export async function getPersonalAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const res = await gmailFetch<{ data?: string }>(
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`
  );
  return Buffer.from(res.data ?? "", "base64url");
}
