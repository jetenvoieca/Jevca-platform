"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createPlatformExpense,
  updatePlatformExpense,
  deletePlatformExpense,
  deleteAllPlatformExpenses,
  importPlatformExpensesCsv,
  type PlatformExpenseRow,
  type CsvImportResult,
} from "@/lib/actions/platformExpenses";
import ConfirmDialog from "@/components/ConfirmDialog";

const inputCls =
  "w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50";

function formatMoney(amount: string, currency: string) {
  const n = parseFloat(amount);
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

type Period = "all" | "thisYear" | "Q1" | "Q2" | "Q3" | "Q4";

// Same quarter definitions used on the Subscriptions and Account pages —
// always this year's quarters, no separate year picker.
const QUARTER_MONTHS: Record<"Q1" | "Q2" | "Q3" | "Q4", [number, number]> = {
  Q1: [1, 3],
  Q2: [4, 6],
  Q3: [7, 9],
  Q4: [10, 12],
};

export default function PlatformExpensesView({
  expenses,
  categories,
  currentYear,
}: {
  expenses: PlatformExpenseRow[];
  categories: string[];
  currentYear: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPending, startImportTransition] = useTransition();
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const importFormRef = useRef<HTMLFormElement>(null);
  const [period, setPeriod] = useState<Period>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const periods: { value: Period; label: string }[] = [
    { value: "all", label: "All time" },
    { value: "thisYear", label: "This Year" },
    { value: "Q1", label: "Q1" },
    { value: "Q2", label: "Q2" },
    { value: "Q3", label: "Q3" },
    { value: "Q4", label: "Q4" },
  ];

  const categoryOptions = useMemo(() => {
    const set = new Set(categories);
    for (const e of expenses) set.add(e.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [categories, expenses]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
      if (period === "all") return true;
      const [yearStr, monthStr] = e.date.split("-");
      const year = Number(yearStr);
      if (year !== currentYear) return false;
      if (period === "thisYear") return true;
      const month = Number(monthStr);
      const [start, end] = QUARTER_MONTHS[period];
      return month >= start && month <= end;
    });
  }, [expenses, period, categoryFilter, currentYear]);

  const totalsByCurrency = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const e of filteredExpenses) {
      totals[e.currency] = (totals[e.currency] || 0) + parseFloat(e.amount);
    }
    return totals;
  }, [filteredExpenses]);

  const handleAdd = async (formData: FormData) => {
    setAddError(null);
    const result = await createPlatformExpense(formData);
    if (result && "error" in result) {
      setAddError(result.error);
      return;
    }
    setAdding(false);
    router.refresh();
  };

  const handleUpdate = async (expenseId: string, formData: FormData) => {
    setEditError(null);
    const result = await updatePlatformExpense(expenseId, formData);
    if (result && "error" in result) {
      setEditError(result.error);
      return;
    }
    setEditingId(null);
    router.refresh();
  };

  const handleDelete = (expenseId: string) => {
    setDeleting(true);
    startTransition(async () => {
      await deletePlatformExpense(expenseId);
      setDeleting(false);
      setConfirmingDeleteId(null);
      router.refresh();
    });
  };

  const handleImport = (formData: FormData) => {
    startImportTransition(async () => {
      const result = await importPlatformExpensesCsv(formData);
      setImportResult(result);
      if (result.imported > 0) {
        importFormRef.current?.reset();
        router.refresh();
      }
    });
  };

  const handleClearAll = () => {
    setClearingAll(true);
    startTransition(async () => {
      await deleteAllPlatformExpenses();
      setClearingAll(false);
      setConfirmingClearAll(false);
      setImportResult(null);
      router.refresh();
    });
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Expenses</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/accounts/settings"
            className="text-sm text-neutral-500 underline-offset-2 hover:underline"
          >
            Expense categories →
          </Link>
          {!adding && (
            <button
              type="button"
              onClick={() => {
                setImporting((v) => !v);
                setImportResult(null);
              }}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              Import CSV
            </button>
          )}
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
            >
              + Add expense
            </button>
          )}
        </div>
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        Your own costs running the platform — hosting, domains, software. Separate from what
        each artist spends (that lives on their own Purchases page).
      </p>

      {importing && (
        <form
          ref={importFormRef}
          action={handleImport}
          className="mb-6 rounded-md border border-neutral-200 bg-neutral-50 p-4"
        >
          <p className="mb-2 text-sm text-neutral-700">
            CSV columns: <code className="text-xs">date, supplier, category, description, amount, currency</code>
          </p>
          <p className="mb-3 text-xs text-neutral-500">
            Date must be YYYY-MM-DD. Category, description, and currency are optional — category
            defaults to &quot;Other&quot; and gets added to your category list automatically if
            it&apos;s new; currency defaults to GBP.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              className="flex-1 text-sm"
            />
            <button
              type="submit"
              disabled={importPending}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {importPending ? "Importing…" : "Import"}
            </button>
            <button
              type="button"
              onClick={() => {
                setImporting(false);
                setImportResult(null);
              }}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-white"
            >
              Close
            </button>
          </div>

          {importResult && (
            <div className="mt-3 text-sm">
              <p className={importResult.imported > 0 ? "text-green-700" : "text-neutral-600"}>
                {importResult.imported} expense{importResult.imported === 1 ? "" : "s"} imported.
              </p>
              {importResult.skipped.length > 0 && (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2">
                  <p className="mb-1 text-xs font-medium text-amber-800">
                    {importResult.skipped.length} row
                    {importResult.skipped.length === 1 ? "" : "s"} skipped:
                  </p>
                  <ul className="space-y-0.5 text-xs text-amber-700">
                    {importResult.skipped.map((s, i) => (
                      <li key={i}>
                        Row {s.row}: {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </form>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {periods.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={`rounded-full border px-3 py-1 text-xs ${
                period === p.value
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {categoryOptions.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700"
          >
            <option value="all">All categories</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>

      {expenses.length > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-neutral-600">
            {Object.keys(totalsByCurrency).length > 0
              ? "Total: " +
                Object.entries(totalsByCurrency)
                  .map(([currency, amount]) => formatMoney(amount.toFixed(2), currency))
                  .join(" · ")
              : ""}
          </p>
          <button
            type="button"
            onClick={() => setConfirmingClearAll(true)}
            className="text-xs text-red-600 hover:underline"
          >
            Clear all expenses
          </button>
        </div>
      )}

      {adding && (
        <form
          action={handleAdd}
          className="mb-6 grid grid-cols-2 gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-3"
        >
          <div>
            <label className="mb-1 block text-xs text-neutral-500">Date</label>
            <input
              type="date"
              name="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className={inputCls}
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1 block text-xs text-neutral-500">Paid to</label>
            <input type="text" name="payeeName" required autoFocus className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">Category</label>
            <select name="category" defaultValue="Other" className={inputCls}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {!categories.includes("Other") && <option value="Other">Other</option>}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">Amount</label>
            <input type="text" inputMode="decimal" name="amount" required className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">Currency</label>
            <select name="currency" defaultValue="GBP" className={inputCls}>
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <label className="mb-1 block text-xs text-neutral-500">Description (optional)</label>
            <input type="text" name="description" className={inputCls} />
          </div>
          {addError && <p className="col-span-2 text-xs text-red-600 sm:col-span-3">{addError}</p>}
          <div className="col-span-2 flex gap-2 sm:col-span-3">
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setAddError(null);
              }}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {filteredExpenses.length === 0 ? (
        <p className="mb-4 text-sm text-neutral-400">
          {period === "all" && categoryFilter === "all"
            ? "No expenses recorded yet."
            : "No expenses match this filter."}
        </p>
      ) : (
        <div className="mb-4 overflow-hidden rounded-md border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Paid to</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredExpenses.map((e) =>
                editingId === e.id ? (
                  <tr key={e.id} className="bg-neutral-50">
                    <td colSpan={6} className="p-3">
                      <form
                        action={(fd) => handleUpdate(e.id, fd)}
                        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
                      >
                        <div>
                          <label className="mb-1 block text-xs text-neutral-500">Date</label>
                          <input type="date" name="date" required defaultValue={e.date} className={inputCls} />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <label className="mb-1 block text-xs text-neutral-500">Paid to</label>
                          <input
                            type="text"
                            name="payeeName"
                            required
                            defaultValue={e.payeeName}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-neutral-500">Category</label>
                          <select name="category" defaultValue={e.category} className={inputCls}>
                            {categories.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                            {!categories.includes(e.category) && (
                              <option value={e.category}>{e.category}</option>
                            )}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-neutral-500">Amount</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            name="amount"
                            required
                            defaultValue={e.amount}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-neutral-500">Currency</label>
                          <select name="currency" defaultValue={e.currency} className={inputCls}>
                            <option value="GBP">GBP</option>
                            <option value="EUR">EUR</option>
                            <option value="USD">USD</option>
                          </select>
                        </div>
                        <div className="col-span-2 sm:col-span-3">
                          <label className="mb-1 block text-xs text-neutral-500">
                            Description (optional)
                          </label>
                          <input
                            type="text"
                            name="description"
                            defaultValue={e.description || ""}
                            className={inputCls}
                          />
                        </div>
                        {editError && (
                          <p className="col-span-2 text-xs text-red-600 sm:col-span-3">{editError}</p>
                        )}
                        <div className="col-span-2 flex gap-2 sm:col-span-3">
                          <button
                            type="submit"
                            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditError(null);
                            }}
                            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-white"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={e.id} className="hover:bg-neutral-50">
                    <td className="whitespace-nowrap px-3 py-2 text-neutral-700">{e.date}</td>
                    <td className="px-3 py-2 text-neutral-900">{e.payeeName}</td>
                    <td className="px-3 py-2 text-neutral-600">{e.category}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-neutral-500">
                      {e.description || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-neutral-900">
                      {formatMoney(e.amount, e.currency)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditError(null);
                          setEditingId(e.id);
                        }}
                        className="mr-2 text-xs text-neutral-500 hover:text-neutral-900 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(e.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmingDeleteId !== null}
        title="Delete this expense?"
        message="This removes the record permanently — can't be undone."
        confirmLabel={deleting ? "Deleting…" : "Delete permanently"}
        danger
        onConfirm={() => confirmingDeleteId && handleDelete(confirmingDeleteId)}
        onCancel={() => setConfirmingDeleteId(null)}
      />

      <ConfirmDialog
        open={confirmingClearAll}
        title="Clear all expenses?"
        message={`This deletes all ${expenses.length} recorded expense${
          expenses.length === 1 ? "" : "s"
        } permanently — can't be undone. Your category list is untouched.`}
        confirmLabel={clearingAll ? "Clearing…" : "Delete all permanently"}
        danger
        onConfirm={handleClearAll}
        onCancel={() => setConfirmingClearAll(false)}
      />
    </div>
  );
}
