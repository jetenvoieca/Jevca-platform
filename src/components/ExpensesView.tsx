"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createExpense,
  updateExpense,
  deleteExpense,
  EXPENSE_CATEGORIES,
  type ExpenseRow,
  type ExpenseCategory,
} from "@/lib/actions/expenses";
import ConfirmDialog from "@/components/ConfirmDialog";

const inputCls =
  "w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50";

function categoryLabel(value: ExpenseCategory) {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function formatMoney(amount: string, currency: string) {
  const n = parseFloat(amount);
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
  } catch {
    // Falls back if `currency` is ever something Intl doesn't recognise
    // — shouldn't happen via the form's own currency field, but a typo'd
    // manual entry shouldn't crash the whole page over it.
    return `${currency} ${n.toFixed(2)}`;
  }
}

export default function ExpensesView({
  siteId,
  artistId,
  expenses,
}: {
  siteId: string;
  artistId: string;
  expenses: ExpenseRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const totalsByCurrency = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const e of expenses) {
      totals[e.currency] = (totals[e.currency] || 0) + parseFloat(e.amount);
    }
    return totals;
  }, [expenses]);

  const handleAdd = async (formData: FormData) => {
    setAddError(null);
    const result = await createExpense(artistId, formData);
    if (result && "error" in result) {
      setAddError(result.error);
      return;
    }
    setAdding(false);
    router.refresh();
  };

  const handleUpdate = async (expenseId: string, formData: FormData) => {
    setEditError(null);
    const result = await updateExpense(expenseId, formData);
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
      await deleteExpense(expenseId);
      setDeleting(false);
      setConfirmingDeleteId(null);
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Purchases</h1>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            + Add purchase
          </button>
        )}
      </div>
      <p className="mb-6 text-sm text-neutral-500">
        What you spend — materials, studio costs, framing, and so on. Recorded manually for now,
        kept as a simple running record rather than full accounting. Not linked to Pennylane or
        any e-invoicing obligation — this is just for your own visibility.
      </p>

      {Object.keys(totalsByCurrency).length > 0 && (
        <p className="mb-4 text-sm text-neutral-600">
          Total:{" "}
          {Object.entries(totalsByCurrency)
            .map(([currency, amount]) => formatMoney(amount.toFixed(2), currency))
            .join(" · ")}
        </p>
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
            <select name="category" defaultValue="OTHER" className={inputCls}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
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

      {expenses.length === 0 ? (
        <p className="text-sm text-neutral-400">No purchases recorded yet.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-neutral-200">
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
              {expenses.map((e) =>
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
                            {EXPENSE_CATEGORIES.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
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
                    <td className="px-3 py-2 text-neutral-600">{categoryLabel(e.category)}</td>
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
        title="Delete this purchase?"
        message="This removes the record permanently — can't be undone."
        confirmLabel={deleting ? "Deleting…" : "Delete permanently"}
        danger
        onConfirm={() => confirmingDeleteId && handleDelete(confirmingDeleteId)}
        onCancel={() => setConfirmingDeleteId(null)}
      />
    </div>
  );
}
