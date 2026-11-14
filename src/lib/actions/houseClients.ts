"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/currentUser";

// House clients (2026-11-14, Craig): the owners of the sites we run —
// see Artist.isHouse. Set in Administration → Clients (HouseClientCard).
export async function setHouseClient(artistId: string, isHouse: boolean): Promise<void> {
  await requireAdmin();
  await db.artist.update({ where: { id: artistId }, data: { isHouse } });
}
