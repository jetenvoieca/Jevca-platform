"use server";

import { revalidatePath } from "next/cache";
import { removeGmailConnection } from "@/lib/gmail";

// Disconnect Gmail, from the Inbox's Personal tab (2026-10-09).
export async function disconnectGmail(): Promise<void> {
  await removeGmailConnection();
  revalidatePath("/accounts/inbox");
}
