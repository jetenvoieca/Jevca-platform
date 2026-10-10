"use server";

import { revalidatePath } from "next/cache";
import { removeGmailConnection } from "@/lib/gmail";
import {
  listPersonalMail,
  personalUnreadCount,
  archivePersonalThread,
  trashPersonalThread,
  trashPersonalMessage,
  openPersonalThread,
  GmailNotConnectedError,
  type PersonalBox,
  type PersonalMailItem,
  type PersonalMailMessage,
} from "@/lib/gmailMessages";
import {
  replyToPersonalMessage,
  forwardPersonalMessage,
  sendNewPersonalEmail,
  personalSendingAddress,
} from "@/lib/gmailSend";

// The Inbox's Personal tab — Craig's own Gmail (2026-10-09).

type Result<T> = { ok: true; data: T } | { ok: false; error: string; reconnect: boolean };

function failure(err: unknown): { ok: false; error: string; reconnect: boolean } {
  return {
    ok: false,
    error: err instanceof Error ? err.message : "Gmail couldn't be reached. Please try again.",
    reconnect: err instanceof GmailNotConnectedError,
  };
}

export async function getPersonalMail(box: PersonalBox): Promise<Result<PersonalMailItem[]>> {
  try {
    return { ok: true, data: await listPersonalMail(box) };
  } catch (err) {
    return failure(err);
  }
}

// Opens a conversation (marking it read in Gmail).
export async function getPersonalThread(threadId: string): Promise<Result<PersonalMailMessage[]>> {
  try {
    return { ok: true, data: await openPersonalThread(threadId) };
  } catch (err) {
    return failure(err);
  }
}

// Reply / forward, from the Gmail's own default sending address (step 3).
export async function replyPersonal(messageId: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return await replyToPersonalMessage(messageId, body);
  } catch (err) {
    return failure(err);
  }
}

export async function composePersonal(
  to: string,
  subject: string,
  body: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return await sendNewPersonalEmail(to, subject, body);
  } catch (err) {
    return failure(err);
  }
}

export async function forwardPersonal(
  messageId: string,
  to: string,
  note: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return await forwardPersonalMessage(messageId, to, note);
  } catch (err) {
    return failure(err);
  }
}

// Archive — the whole conversation out of the inbox, as in Gmail.
export async function archivePersonal(threadId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await archivePersonalThread(threadId);
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

// Delete — to Gmail's Bin: a whole conversation from the list, or one
// email from an open conversation.
export async function deletePersonal(
  target: { threadId: string } | { messageId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if ("threadId" in target) await trashPersonalThread(target.threadId);
    else await trashPersonalMessage(target.messageId);
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

// The Personal pill's unread count; null if Gmail isn't connected or
// can't be reached (the pill then shows no number).
export async function getPersonalUnreadCount(): Promise<number | null> {
  try {
    return await personalUnreadCount();
  } catch {
    return null;
  }
}

// The address replies and forwards go out from, shown in the tab.
export async function getPersonalSendingAddress(): Promise<string | null> {
  try {
    return await personalSendingAddress();
  } catch {
    return null;
  }
}

export async function disconnectGmail(): Promise<void> {
  await removeGmailConnection();
  revalidatePath("/accounts/inbox");
}
