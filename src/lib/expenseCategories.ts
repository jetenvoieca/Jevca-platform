// Superseded 2026-08-27 — expense categories are now a per-artist
// editable list (Artist.expenseCategories), managed via
// src/lib/actions/purchaseSettings.ts and the Purchases Settings page,
// not a fixed constant. Nothing imports this file any more; left in
// place rather than deleted, same convention as other dormant code in
// this codebase, and useful as a record of the original default list.

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
