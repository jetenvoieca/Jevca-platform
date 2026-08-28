"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type PlatformExpenseRow = {
  id: string;
  date: string; // ISO date, YYYY-MM-DD
  payeeName: string;
  description: string | null;
  amount: string;
  currency: string;
  category: string;
};

// Newest first, same convention as the artist-level equivalent.
export async function listPlatformExpenses(): Promise<PlatformExpenseRow[]> {
  const rows = await db.platformExpense.findMany({ orderBy: { date: "desc" } });
  return rows.map((e) => ({
    id: e.id,
    date: e.date.toISOString().slice(0, 10),
    payeeName: e.payeeName,
    description: e.description,
    amount: e.amount.toString(),
    currency: e.currency,
    category: e.category,
  }));
}

function parseCategory(raw: string | null): string {
  return raw?.trim() || "Other";
}

export async function createPlatformExpense(
  formData: FormData
): Promise<{ id: string } | { error: string }> {
  const dateRaw = (formData.get("date") as string)?.trim();
  const payeeName = (formData.get("payeeName") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const amountRaw = (formData.get("amount") as string)?.trim();
  const currency = (formData.get("currency") as string)?.trim() || "GBP";
  const category = parseCategory((formData.get("category") as string)?.trim() || null);

  if (!dateRaw) return { error: "Date is required." };
  const date = new Date(dateRaw);
  if (Number.isNaN(date.getTime())) return { error: "Date isn't valid." };
  if (!payeeName) return { error: "Who was this paid to?" };
  const amount = parseFloat(amountRaw);
  if (!amountRaw || Number.isNaN(amount)) return { error: "Amount isn't valid." };

  const created = await db.platformExpense.create({
    data: { date, payeeName, description, amount, currency, category },
  });
  revalidatePath(`/accounts`);
  return { id: created.id };
}

export async function updatePlatformExpense(
  expenseId: string,
  formData: FormData
): Promise<{ error: string } | void> {
  const dateRaw = (formData.get("date") as string)?.trim();
  const payeeName = (formData.get("payeeName") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const amountRaw = (formData.get("amount") as string)?.trim();
  const currency = (formData.get("currency") as string)?.trim() || "GBP";
  const category = parseCategory((formData.get("category") as string)?.trim() || null);

  if (!dateRaw) return { error: "Date is required." };
  const date = new Date(dateRaw);
  if (Number.isNaN(date.getTime())) return { error: "Date isn't valid." };
  if (!payeeName) return { error: "Who was this paid to?" };
  const amount = parseFloat(amountRaw);
  if (!amountRaw || Number.isNaN(amount)) return { error: "Amount isn't valid." };

  await db.platformExpense.update({
    where: { id: expenseId },
    data: { date, payeeName, description, amount, currency, category },
  });
  revalidatePath(`/accounts`);
}

export async function deletePlatformExpense(expenseId: string): Promise<void> {
  await db.platformExpense.delete({ where: { id: expenseId } });
  revalidatePath(`/accounts`);
}
