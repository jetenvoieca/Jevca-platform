"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getCustomerDetail,
  updateCustomer,
  type CustomerSummary,
  type CustomerDetail,
} from "@/lib/actions/customers";

function formatMoney(amount: string, currency: string) {
  const n = parseFloat(amount);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  ABANDONED: "Abandoned",
};

export default function CustomersView({
  siteId,
  artistId,
  customers,
}: {
  siteId: string;
  artistId: string;
  customers: (CustomerSummary & { saleCount: number })[];
}) {
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [savedField, setSavedField] = useState<string | null>(null);
  const router = useRouter();

  const filtered = q.trim()
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(q.trim().toLowerCase()) ||
          (c.email || "").toLowerCase().includes(q.trim().toLowerCase())
      )
    : customers;

  const openRow = (customerId: string) => {
    setSelectedId(customerId);
    setSelectedDetail(null);
    setLoading(true);
    getCustomerDetail(customerId).then((detail) => {
      setSelectedDetail(detail);
      setLoading(false);
    });
  };

  const saveField = (
    field: "name" | "email" | "phone" | "address" | "language" | "notes",
    value: string
  ) => {
    if (!selectedDetail) return;
    const fd = new FormData();
    fd.set("name", field === "name" ? value : selectedDetail.name);
    fd.set("email", field === "email" ? value : selectedDetail.email || "");
    fd.set("phone", field === "phone" ? value : selectedDetail.phone || "");
    fd.set("address", field === "address" ? value : selectedDetail.address || "");
    fd.set("language", field === "language" ? value : selectedDetail.language || "");
    fd.set("notes", field === "notes" ? value : selectedDetail.notes || "");
    startTransition(async () => {
      await updateCustomer(selectedDetail.id, fd);
      router.refresh();
      setSelectedDetail((prev) => (prev ? { ...prev, [field]: value || null } : prev));
      setSavedField(field);
      setTimeout(() => setSavedField(null), 1500);
    });
  };

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Customers</h1>
      <p className="mb-4 text-sm text-neutral-500">
        {customers.length === 0
          ? "No customers yet — one is created automatically the first time a sale is started."
          : `${customers.length} customer${customers.length === 1 ? "" : "s"}`}
      </p>

      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name or email…"
        className="mb-4 w-full max-w-xs rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
      />

      <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 480px" }}>
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-400">
                <th className="px-3 py-2 font-normal">Name</th>
                <th className="px-3 py-2 font-normal">Email</th>
                <th className="px-3 py-2 font-normal">Sales</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-sm text-neutral-400">
                    Nothing here yet.
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => openRow(c.id)}
                  className={`cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50 ${
                    selectedId === c.id ? "bg-neutral-50" : ""
                  }`}
                >
                  <td className="px-3 py-2 font-medium text-neutral-900">{c.name}</td>
                  <td className="px-3 py-2 text-neutral-500">{c.email || "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{c.saleCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          {!selectedId ? (
            <p className="text-sm text-neutral-400">Select a customer to see their details.</p>
          ) : loading || !selectedDetail ? (
            <p className="text-sm text-neutral-400">Loading…</p>
          ) : (
            <div className="rounded-lg border border-neutral-200 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-neutral-900">{selectedDetail.name}</h2>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    setSelectedDetail(null);
                  }}
                  className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                >
                  Close
                </button>
              </div>

              {selectedDetail.alsoCustomerOf.length > 0 && (
                <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Also a customer of: {selectedDetail.alsoCustomerOf.join(", ")}
                </p>
              )}

              <div className="mb-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">Name</label>
                  <input
                    key={`name-${selectedDetail.id}`}
                    type="text"
                    defaultValue={selectedDetail.name}
                    onBlur={(e) => saveField("name", e.target.value.trim())}
                    disabled={isPending}
                    className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">Email</label>
                  <input
                    key={`email-${selectedDetail.id}`}
                    type="email"
                    defaultValue={selectedDetail.email || ""}
                    onBlur={(e) => saveField("email", e.target.value.trim())}
                    disabled={isPending}
                    className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">Phone</label>
                  <input
                    key={`phone-${selectedDetail.id}`}
                    type="text"
                    defaultValue={selectedDetail.phone || ""}
                    onBlur={(e) => saveField("phone", e.target.value.trim())}
                    disabled={isPending}
                    className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">Address</label>
                  <textarea
                    key={`address-${selectedDetail.id}`}
                    defaultValue={selectedDetail.address || ""}
                    onBlur={(e) => saveField("address", e.target.value.trim())}
                    disabled={isPending}
                    rows={2}
                    className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">
                    Invoice language
                  </label>
                  <select
                    key={`language-${selectedDetail.id}`}
                    defaultValue={selectedDetail.language || ""}
                    onChange={(e) => saveField("language", e.target.value)}
                    disabled={isPending}
                    className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                  >
                    <option value="">Use artist default</option>
                    <option value="EN">English</option>
                    <option value="FR">French</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">Notes</label>
                  <textarea
                    key={`notes-${selectedDetail.id}`}
                    defaultValue={selectedDetail.notes || ""}
                    onBlur={(e) => saveField("notes", e.target.value.trim())}
                    disabled={isPending}
                    rows={2}
                    className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                  />
                </div>
                {savedField && <p className="text-xs text-green-600">Saved</p>}
              </div>

              <div className="border-t border-neutral-100 pt-4">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Sales ({selectedDetail.purchases.length})
                </h3>
                {selectedDetail.purchases.length === 0 ? (
                  <p className="text-sm text-neutral-400">No sales yet.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedDetail.purchases.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-md border border-neutral-100 px-3 py-2 text-sm"
                      >
                        <div>
                          <span className="text-neutral-700">{p.artworkTitle}</span>
                          <span className="ml-2 text-neutral-400">
                            {formatMoney(p.totalAmount, p.currency)}
                          </span>
                        </div>
                        <span
                          className={
                            p.status === "COMPLETED" ? "text-green-600" : "text-neutral-400"
                          }
                        >
                          {STATUS_LABEL[p.status]}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
