"use server";

import * as inbox from "@/lib/inbox";
import { requireAdmin } from "@/lib/currentUser";

// The Inbox, from the browser (2026-10-26): admin only; the work is in
// lib/inbox.ts (the Resend webhook files incoming mail there directly).

export type { InboxThreadAttachment, InboxThreadItem, InboxSummaryItem, InboxView, SentSummaryItem } from "@/lib/inbox";

export async function getInboxList(...args: Parameters<typeof inbox.getInboxList>) {
  await requireAdmin();
  return inbox.getInboxList(...args);
}

export async function getUnreadCounts(...args: Parameters<typeof inbox.getUnreadCounts>) {
  await requireAdmin();
  return inbox.getUnreadCounts(...args);
}

export async function getArtistOptions(...args: Parameters<typeof inbox.getArtistOptions>) {
  await requireAdmin();
  return inbox.getArtistOptions(...args);
}

export async function getSentList(...args: Parameters<typeof inbox.getSentList>) {
  await requireAdmin();
  return inbox.getSentList(...args);
}

export async function getThread(...args: Parameters<typeof inbox.getThread>) {
  await requireAdmin();
  return inbox.getThread(...args);
}

export async function sendInboxReply(...args: Parameters<typeof inbox.sendInboxReply>) {
  await requireAdmin();
  return inbox.sendInboxReply(...args);
}

export async function archiveInboundEmail(...args: Parameters<typeof inbox.archiveInboundEmail>) {
  await requireAdmin();
  return inbox.archiveInboundEmail(...args);
}

export async function markNotSpam(...args: Parameters<typeof inbox.markNotSpam>) {
  await requireAdmin();
  return inbox.markNotSpam(...args);
}

export async function markAsSpam(...args: Parameters<typeof inbox.markAsSpam>) {
  await requireAdmin();
  return inbox.markAsSpam(...args);
}

export async function unarchiveInboundEmail(...args: Parameters<typeof inbox.unarchiveInboundEmail>) {
  await requireAdmin();
  return inbox.unarchiveInboundEmail(...args);
}

export async function deleteInboundEmail(...args: Parameters<typeof inbox.deleteInboundEmail>) {
  await requireAdmin();
  return inbox.deleteInboundEmail(...args);
}

export async function deleteOutboundEmail(...args: Parameters<typeof inbox.deleteOutboundEmail>) {
  await requireAdmin();
  return inbox.deleteOutboundEmail(...args);
}
