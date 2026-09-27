import type { Resend } from "resend";
import { db } from "@/lib/db";

// Linking email replies back to the task they belong to (2026-09-27).
//
// Every email carries a Message-ID, and a reply names the one it answers
// in its In-Reply-To and References headers. So each email sent from a
// task records the Message-ID it went out with (recordSentMessageId), and
// each email that arrives is checked against those (findTaskForReply) —
// an exact match, nothing visible to the recipient, and it follows the
// whole conversation: a reply sent from the Inbox to a task-linked
// message is linked to the task too, so the next reply to that is found
// the same way. A reply whose mail program leaves the headers out simply
// isn't linked, and lands in the Inbox as normal.
//
// Message-IDs are stored with their angle brackets (<...>), the form they
// take in headers — see canonicalMessageId.

export function canonicalMessageId(id: string | null | undefined): string | null {
  const trimmed = id?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("<") ? trimmed : `<${trimmed}>`;
}

// Email header names aren't case-sensitive, so neither is this lookup.
export function headerValue(headers: Record<string, string> | null | undefined, name: string): string | null {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : null;
}

// Every Message-ID an arriving email says it's replying to.
export function referencedMessageIds(headers: Record<string, string> | null | undefined): string[] {
  const ids = new Set<string>();
  for (const name of ["in-reply-to", "references"]) {
    for (const id of headerValue(headers, name)?.match(/<[^<>\s]+>/g) ?? []) ids.add(id);
  }
  return [...ids];
}

// Reads the Message-ID Resend gave a just-sent email and stores it. Resend
// may not have it ready this soon; if not, findTaskForReply fetches it
// later, when it's actually needed. Never fails the send it follows.
export async function recordSentMessageId(
  resend: Resend,
  outboundEmailId: string,
  resendEmailId: string
): Promise<void> {
  try {
    const { data } = await resend.emails.get(resendEmailId);
    const messageId = canonicalMessageId(data?.message_id);
    if (messageId) await db.outboundEmail.update({ where: { id: outboundEmailId }, data: { messageId } });
  } catch {
    // See note above.
  }
}

async function taskForMessageIds(ids: string[]): Promise<string | null> {
  const sent = await db.outboundEmail.findFirst({
    where: { messageId: { in: ids }, taskId: { not: null } },
    orderBy: { sentAt: "desc" },
    select: { taskId: true },
  });
  if (sent?.taskId) return sent.taskId;
  const received = await db.inboundEmail.findFirst({
    where: { messageId: { in: ids }, taskId: { not: null } },
    orderBy: { receivedAt: "desc" },
    select: { taskId: true },
  });
  return received?.taskId ?? null;
}

// The task an arriving email is a reply to, if any. If nothing matches
// straight away, the Message-IDs not yet recorded for task emails sent to
// this sender are fetched from Resend first (at most the latest 20), then
// it's checked again.
export async function findTaskForReply(
  resend: Resend,
  headers: Record<string, string> | null | undefined,
  fromAddress: string
): Promise<string | null> {
  const ids = referencedMessageIds(headers);
  if (ids.length === 0) return null;

  const found = await taskForMessageIds(ids);
  if (found) return found;

  const pending = await db.outboundEmail.findMany({
    where: {
      taskId: { not: null },
      messageId: null,
      resendEmailId: { not: null },
      toAddress: { equals: fromAddress, mode: "insensitive" },
    },
    orderBy: { sentAt: "desc" },
    take: 20,
    select: { id: true, resendEmailId: true },
  });
  if (pending.length === 0) return null;
  for (const p of pending) {
    if (p.resendEmailId) await recordSentMessageId(resend, p.id, p.resendEmailId);
  }
  return taskForMessageIds(ids);
}
