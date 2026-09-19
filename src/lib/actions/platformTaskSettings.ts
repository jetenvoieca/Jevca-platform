"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

// The Settings-editable Task category list (2026-09-19, CRM Phase 2) —
// offered as the Category dropdown on the Inbox's task form. Same
// pattern as the platform expense categories (see
// platformExpenseSettings.ts): one list on the PlatformSettings
// singleton row.

const SINGLETON_ID = "singleton";

export async function getPlatformTaskCategories(): Promise<string[]> {
  const settings = await db.platformSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
  return settings.taskCategories;
}

export async function addPlatformTaskCategory(formData: FormData): Promise<void> {
  const value = (formData.get("value") as string)?.trim();
  if (!value) return;
  const current = await getPlatformTaskCategories();
  const next = [...current.filter((v) => v.toLowerCase() !== value.toLowerCase()), value];
  await db.platformSettings.update({ where: { id: SINGLETON_ID }, data: { taskCategories: next } });
  revalidatePath("/accounts/settings");
  revalidatePath("/accounts/inbox");
}

export async function removePlatformTaskCategory(value: string): Promise<void> {
  const current = await getPlatformTaskCategories();
  const next = current.filter((v) => v !== value);
  await db.platformSettings.update({ where: { id: SINGLETON_ID }, data: { taskCategories: next } });
  revalidatePath("/accounts/settings");
  revalidatePath("/accounts/inbox");
}
