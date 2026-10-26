"use server";

import { requireAdmin } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

const SINGLETON_ID = "singleton";

export async function getPlatformExpenseCategories(): Promise<string[]> {
  await requireAdmin();
  const settings = await db.platformSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
  return settings.expenseCategories;
}

export async function addPlatformExpenseCategory(formData: FormData) {
  await requireAdmin();
  const value = (formData.get("value") as string)?.trim();
  if (!value) return;
  const current = await getPlatformExpenseCategories();
  const next = [...current.filter((v) => v.toLowerCase() !== value.toLowerCase()), value];
  await db.platformSettings.update({ where: { id: SINGLETON_ID }, data: { expenseCategories: next } });
  revalidatePath(`/accounts`);
}

export async function removePlatformExpenseCategory(value: string) {
  await requireAdmin();
  const current = await getPlatformExpenseCategories();
  const next = current.filter((v) => v !== value);
  await db.platformSettings.update({ where: { id: SINGLETON_ID }, data: { expenseCategories: next } });
  revalidatePath(`/accounts`);
}
