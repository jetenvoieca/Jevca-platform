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

// The Inbox's Personal tab — Craig's own Gmail (2026-10-09).

type Result<T> = { ok: true; data: T } | { ok: false; error: string; reconnect: boolean };

function failure(err: unknown): { ok: false; error: string; reconnect: boolean } {
  return {
    ok: false,
    error: err instanceof Error ? err.message : "Gmail couldn't be reached. Please try again.",
    reconnect: err instanceof GmailNotConnectedError,
  };
}

export async function getPersonalMail(
  box: PersonalBox,
  pageToken: string | null
): Promise<Result<{ items: PersonalMailItem[]; nextPageToken: string | null }>> {
  try {
    return { ok: true, data: await listPersonalMail(box, pageToken) };
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

export async function disconnectGmail(): Promise<void> {
  await removeGmailConnection();
  revalidatePath("/accounts/inbox");
}
