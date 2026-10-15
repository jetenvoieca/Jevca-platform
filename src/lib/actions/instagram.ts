"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

// Disconnect Instagram (Marketing → Settings, 2026-10-15): forgets the
// artist's connection. Instagram has no way for an app to withdraw its
// own access; the artist can remove it in Instagram's settings (Apps and
// websites) if they want.
export async function disconnectInstagram(artistId: string, siteId: string): Promise<void> {
  await db.instagramConnection.deleteMany({ where: { artistId } });
  revalidatePath(`/sites/${siteId}/marketing/settings`);
}
