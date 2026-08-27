// Deliberately its own file, not part of src/lib/actions/expenses.ts —
// a "use server" file can only export async functions, and this is a
// plain constant, imported by both the server actions and the client
// view.

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
