"use server";

import { requireArtistAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function getExpenseCategories(artistId: string): Promise<string[]> {
  await requireArtistAccess(artistId);
  const artist = await db.artist.findUnique({
    where: { id: artistId },
    select: { expenseCategories: true },
  });
  return artist?.expenseCategories ?? [];
}

export async function addExpenseCategory(artistId: string, siteId: string, formData: FormData) {
  await requireArtistAccess(artistId);
  const value = (formData.get("value") as string)?.trim();
  if (!value) return;
  const current = await getExpenseCategories(artistId);
  // Case-insensitive de-dupe, same convention as the Artwork preset lists.
  const next = [...current.filter((v) => v.toLowerCase() !== value.toLowerCase()), value];
  await db.artist.update({ where: { id: artistId }, data: { expenseCategories: next } });
  revalidatePath(`/sites/${siteId}/purchases/settings`);
  revalidatePath(`/sites/${siteId}/purchases`);
}

export async function removeExpenseCategory(artistId: string, siteId: string, value: string) {
  await requireArtistAccess(artistId);
  const current = await getExpenseCategories(artistId);
  const next = current.filter((v) => v !== value);
  await db.artist.update({ where: { id: artistId }, data: { expenseCategories: next } });
  revalidatePath(`/sites/${siteId}/purchases/settings`);
  revalidatePath(`/sites/${siteId}/purchases`);
}
