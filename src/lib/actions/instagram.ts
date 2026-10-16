"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { removeZernioAccount } from "@/lib/instagram";

// Disconnect Instagram (Marketing → Settings, 2026-10-15): disconnects
// the account at Zernio and forgets it here.
export async function disconnectInstagram(
  artistId: string,
  siteId: string
): Promise<{ ok: true } | { error: string }> {
  const connection = await db.instagramConnection.findUnique({ where: { artistId } });
  if (connection) {
    try {
      await removeZernioAccount(connection.zernioAccountId);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Couldn't disconnect — try again." };
    }
    await db.instagramConnection.delete({ where: { artistId } });
  }
  revalidatePath(`/sites/${siteId}/marketing/settings`);
  return { ok: true };
}
