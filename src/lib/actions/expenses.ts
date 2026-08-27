"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type ExpenseCategory =
  | "MATERIALS"
  | "STUDIO"
  | "FRAMING"
  | "INSURANCE"
  | "EQUIPMENT"
  | "SHIPPING"
  | "PROFESSIONAL_FEES"
  | "TRAVEL"
  | "MARKETING"
  | "OTHER";

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "MATERIALS", label: "Materials" },
  { value: "STUDIO", label: "Studio" },
  { value: "FRAMING", label: "Framing" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "EQUIPMENT", label: "Equipment" },
  { value: "SHIPPING", label: "Shipping" },
  { value: "PROFESSIONAL_FEES", label: "Professional fees" },
  { value: "TRAVEL", label: "Travel" },
  { value: "MARKETING", label: "Marketing" },
  { value: "OTHER", label: "Other" },
];

export type ExpenseRow = {
  id: string;
  date: string; // ISO date, YYYY-MM-DD
  payeeName: string;
  description: string | null;
  amount: string;
  currency: string;
  category: ExpenseCategory;
};

// Newest first, same convention as Sales/Galleries lists elsewhere.
export async function listExpenses(artistId: string): Promise<ExpenseRow[]> {
  const rows = await db.expense.findMany({
    where: { artistId },
    orderBy: { date: "desc" },
  });
  return rows.map((e) => ({
    id: e.id,
    date: e.date.toISOString().slice(0, 10),
    payeeName: e.payeeName,
    description: e.description,
    amount: e.amount.toString(),
    currency: e.currency,
    category: e.category as ExpenseCategory,
  }));
}

function parseCategory(raw: string | null): ExpenseCategory {
  const valid = EXPENSE_CATEGORIES.map((c) => c.value);
  return valid.includes(raw as ExpenseCategory) ? (raw as ExpenseCategory) : "OTHER";
}

export async function createExpense(
  artistId: string,
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

  const created = await db.expense.create({
    data: { artistId, date, payeeName, description, amount, currency, category },
  });
  revalidatePath(`/sites`);
  return { id: created.id };
}

export async function updateExpense(
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

  await db.expense.update({
    where: { id: expenseId },
    data: { date, payeeName, description, amount, currency, category },
  });
  revalidatePath(`/sites`);
}

// Simple hard delete, no soft-delete/archive — same precedent as
// Customer/Gallery delete elsewhere (this is a manual ledger entry, not
// a record anything else links to).
export async function deleteExpense(expenseId: string): Promise<void> {
  await db.expense.delete({ where: { id: expenseId } });
  revalidatePath(`/sites`);
}
