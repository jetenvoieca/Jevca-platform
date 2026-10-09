"use server";

import { revalidatePath } from "next/cache";
import { removeGmailConnection } from "@/lib/gmail";
import {
  listPersonalMail,
  openPersonalThread,
  GmailNotConnectedError,
  type PersonalBox,
  type PersonalMailItem,
  type PersonalMailMessage,
} from "@/lib/gmailMessages";
import { replyToPersonalThread, forwardPersonalMessage, personalSendingAddress } from "@/lib/gmailSend";

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
export async function replyPersonal(threadId: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return await replyToPersonalThread(threadId, body);
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
