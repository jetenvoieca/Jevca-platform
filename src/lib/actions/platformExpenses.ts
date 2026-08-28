"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";

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

export type CsvImportResult = {
  imported: number;
  skipped: { row: number; reason: string }[];
};

// CSV import (2026-08-28) — an alternative to a live N26/Open Banking
// connection, which was checked and parked (see docs/future-ideas.md).
// Deliberately a fixed, simple column set (date, supplier, category,
// description, amount, currency) rather than trying to parse N26's own
// raw export format — the person curates/filters the CSV themselves
// before importing (removing anything that isn't a real business
// expense), so this only ever needs to understand its own simple shape.
//
// Date must be YYYY-MM-DD, checked strictly — accepting ambiguous
// formats like "03/04/2026" would risk silently swapping day and month.
export async function importPlatformExpensesCsv(formData: FormData): Promise<CsvImportResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { imported: 0, skipped: [{ row: 0, reason: "No file selected." }] };
  }

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const skipped: { row: number; reason: string }[] = [];
  const toCreate: {
    date: Date;
    payeeName: string;
    description: string | null;
    amount: number;
    currency: string;
    category: string;
  }[] = [];
  const newCategories = new Set<string>();

  parsed.data.forEach((row, i) => {
    const rowNumber = i + 2; // header is row 1, data starts at row 2
    const dateRaw = (row["date"] || "").trim();
    const supplier = (row["supplier"] || "").trim();
    const categoryRaw = (row["category"] || "").trim();
    const description = (row["description"] || "").trim();
    const amountRaw = (row["amount"] || "").trim();
    const currencyRaw = (row["currency"] || "").trim().toUpperCase();

    if (!dateRaw && !supplier && !amountRaw) return; // fully blank row, ignore quietly

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      skipped.push({ row: rowNumber, reason: `Date "${dateRaw}" isn't in YYYY-MM-DD format.` });
      return;
    }
    const date = new Date(dateRaw);
    if (Number.isNaN(date.getTime())) {
      skipped.push({ row: rowNumber, reason: `Date "${dateRaw}" isn't a real date.` });
      return;
    }
    if (!supplier) {
      skipped.push({ row: rowNumber, reason: "Missing supplier." });
      return;
    }
    const amount = parseFloat(amountRaw);
    if (!amountRaw || Number.isNaN(amount)) {
      skipped.push({ row: rowNumber, reason: `Amount "${amountRaw}" isn't a valid number.` });
      return;
    }

    if (categoryRaw) newCategories.add(categoryRaw);

    toCreate.push({
      date,
      payeeName: supplier,
      description: description || null,
      amount,
      currency: currencyRaw || "GBP",
      category: categoryRaw || "Other",
    });
  });

  if (toCreate.length > 0) {
    await db.platformExpense.createMany({ data: toCreate });
  }

  // Any category seen in the CSV that isn't already in the editable list
  // gets added — same case-insensitive de-dupe as adding one by hand on
  // the Settings page, just batched.
  if (newCategories.size > 0) {
    const settings = await db.platformSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
    const existingLower = new Set(settings.expenseCategories.map((c) => c.toLowerCase()));
    const additions = [...newCategories].filter((c) => !existingLower.has(c.toLowerCase()));
    if (additions.length > 0) {
      await db.platformSettings.update({
        where: { id: "singleton" },
        data: { expenseCategories: [...settings.expenseCategories, ...additions] },
      });
    }
  }

  revalidatePath(`/accounts`);
  return { imported: toCreate.length, skipped };
}
