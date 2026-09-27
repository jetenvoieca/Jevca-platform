// Month-by-month Sales vs Expenses grouping, shared by the platform's own
// Account page (/accounts/summary) and each artist's Account page
// (/sites/[id]/account) — both render AccountSummaryView, so they group
// money the same way and can't drift apart (2026-09-27).
//
// A plain synchronous function (not a server action) — callers do their
// own scoped DB query and pass in just amount, currency and date.

export type MonthRow = {
  key: string; // "YYYY-MM"
  label: string; // e.g. "September 2026"
  salesByCurrency: Record<string, number>;
  expensesByCurrency: Record<string, number>;
};

export type AccountEntry = {
  amount: string | number | { toString(): string };
  currency: string;
  date: Date;
};

export function buildAccountMonths(
  sales: AccountEntry[],
  expenses: AccountEntry[],
  now: Date = new Date()
): MonthRow[] {
  const months = new Map<string, MonthRow>();

  function group(date: Date): MonthRow {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    let row = months.get(key);
    if (!row) {
      row = {
        key,
        label: date.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        salesByCurrency: {},
        expensesByCurrency: {},
      };
      months.set(key, row);
    }
    return row;
  }

  function add(entries: AccountEntry[], field: "salesByCurrency" | "expensesByCurrency") {
    for (const e of entries) {
      if (Number.isNaN(e.date.getTime())) continue;
      const amount = parseFloat(e.amount.toString());
      if (Number.isNaN(amount)) continue;
      const bucket = group(e.date)[field];
      bucket[e.currency] = (bucket[e.currency] || 0) + amount;
    }
  }

  add(sales, "salesByCurrency");
  add(expenses, "expensesByCurrency");

  // Every month of the current year up to now shows even with no data,
  // so the table reads as a year-to-date view.
  for (let m = 0; m <= now.getMonth(); m++) {
    group(new Date(now.getFullYear(), m, 1));
  }

  return Array.from(months.values()).sort((a, b) => (a.key > b.key ? 1 : -1));
}
