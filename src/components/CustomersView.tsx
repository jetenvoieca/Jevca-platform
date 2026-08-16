"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getCustomerDetail,
  updateCustomer,
  createCustomer,
  deleteCustomer,
  type CustomerSummary,
  type CustomerDetail,
} from "@/lib/actions/customers";
import CustomerImportPanel from "@/components/CustomerImportPanel";
import ConfirmDialog from "@/components/ConfirmDialog";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  ABANDONED: "Abandoned",
};

const inputCls =
  "w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50";
const labelCls = "mb-1 block text-xs text-neutral-500";

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
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const router = useRouter();

  const filtered = customers.filter((c) => {
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return c.name.toLowerCase().includes(needle) || (c.email || "").toLowerCase().includes(needle);
  });

  const openRow = (customerId: string) => {
    setSelectedId(customerId);
    setSelectedDetail(null);
    setSelectedWorkId(null);
    setLoading(true);
    getCustomerDetail(customerId).then((detail) => {
      setSelectedDetail(detail);
      setLoading(false);
    });
  };

  const saveField = (
    field: "firstName" | "lastName" | "email" | "phone" | "address" | "language" | "notes",
    value: string
  ) => {
    if (!selectedDetail) return;
    const fd = new FormData();
    fd.set("kind", "INDIVIDUAL");
    fd.set("firstName", field === "firstName" ? value : selectedDetail.firstName || "");
    fd.set("lastName", field === "lastName" ? value : selectedDetail.lastName || "");
    fd.set("email", field === "email" ? value : selectedDetail.email || "");
    fd.set("phone", field === "phone" ? value : selectedDetail.phone || "");
    fd.set("address", field === "address" ? value : selectedDetail.address || "");
    fd.set("language", field === "language" ? value : selectedDetail.language || "");
    fd.set("notes", field === "notes" ? value : selectedDetail.notes || "");

    startTransition(async () => {
      await updateCustomer(selectedDetail.id, fd);
      router.refresh();
      setSelectedDetail((prev) => {
        if (!prev) return prev;
        const next = { ...prev, [field]: value || null };
        if (field === "firstName" || field === "lastName") {
          next.name = [next.firstName, next.lastName].filter(Boolean).join(" ") || prev.name;
        }
        return next;
      });
      setSavedField(field);
      setTimeout(() => setSavedField(null), 1500);
    });
  };

  const handleAddContact = async (formData: FormData) => {
    setAddError(null);
    formData.set("kind", "INDIVIDUAL");
    const result = await createCustomer(artistId, formData);
    if ("error" in result) {
      setAddError(result.error);
      return;
    }
    setAdding(false);
    router.refresh();
    openRow(result.id);
  };

  const handleDeleteCustomer = () => {
    if (!selectedDetail) return;
    setDeleting(true);
    startTransition(async () => {
      await deleteCustomer(selectedDetail.id);
      setDeleting(false);
      setConfirmingDelete(false);
      setSelectedId(null);
      setSelectedDetail(null);
      router.refresh();
    });
  };

  const selectedWork = selectedDetail?.purchases.find((p) => p.id === selectedWorkId) || null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ---- Purchased Works (left) ---- */}
      <div className="flex-1 overflow-y-auto p-6">
        <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Purchased Works</h1>
        {!selectedDetail ? (
          <p className="text-sm text-neutral-400">
            Select a customer to see the works they&apos;ve bought.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-neutral-500">{selectedDetail.name}</p>
            <div className="flex gap-6">
              <div className="flex-1">
                {selectedDetail.purchases.length === 0 ? (
                  <p className="text-sm text-neutral-400">No purchases yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {selectedDetail.purchases.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedWorkId(p.id)}
                        className={`w-28 shrink-0 rounded-lg border-2 p-1 text-left ${
                          selectedWorkId === p.id
                            ? "border-neutral-900"
                            : "border-transparent hover:border-neutral-200"
                        }`}
                      >
                        <div className="aspect-square overflow-hidden rounded-md bg-neutral-100">
                          {p.artworkImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.artworkImageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <p className="mt-1.5 truncate text-xs font-medium text-neutral-900">
                          {p.artworkTitle}
                        </p>
                        <p className="text-xs text-neutral-400">
                          {p.currency} {parseFloat(p.totalAmount).toFixed(0)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedWork && (
                <div className="w-80 shrink-0 rounded-lg border border-neutral-200 p-4">
                  <p className="mb-2 text-sm font-semibold text-neutral-900">
                    {selectedWork.artworkTitle}
                  </p>
                  <dl className="space-y-1.5 text-xs text-neutral-500">
                    {selectedWork.artworkMedium && (
                      <div>
                        <dt className="inline text-neutral-400">Medium: </dt>
                        <dd className="inline">{selectedWork.artworkMedium}</dd>
                      </div>
                    )}
                    {selectedWork.artworkSize && (
                      <div>
                        <dt className="inline text-neutral-400">Size: </dt>
                        <dd className="inline">{selectedWork.artworkSize}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="inline text-neutral-400">Sold for: </dt>
                      <dd className="inline">
                        {selectedWork.currency} {parseFloat(selectedWork.totalAmount).toFixed(2)}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-neutral-400">Status: </dt>
                      <dd className="inline">{STATUS_LABEL[selectedWork.status]}</dd>
                    </div>
                    <div>
                      <dt className="inline text-neutral-400">Date: </dt>
                      <dd className="inline">
                        {new Date(selectedWork.createdAt).toLocaleDateString()}
                      </dd>
                    </div>
                    {selectedWork.artworkDescription && (
                      <p className="pt-2 text-neutral-600">{selectedWork.artworkDescription}</p>
                    )}
                  </dl>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ---- Customer details (middle) ---- */}
      <div className="w-[480px] shrink-0 overflow-y-auto border-l border-neutral-200 p-6">
        {!selectedId ? (
          <p className="text-sm text-neutral-400">Select a customer to see their details.</p>
        ) : loading || !selectedDetail ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">{selectedDetail.name}</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
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
            </div>

            {selectedDetail.alsoCustomerOf.length > 0 && (
              <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Also a customer of: {selectedDetail.alsoCustomerOf.join(", ")}
              </p>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>First name</label>
                  <input
                    key={`firstName-${selectedDetail.id}`}
                    type="text"
                    defaultValue={selectedDetail.firstName || ""}
                    onBlur={(e) => saveField("firstName", e.target.value.trim())}
                    disabled={isPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Last name</label>
                  <input
                    key={`lastName-${selectedDetail.id}`}
                    type="text"
                    defaultValue={selectedDetail.lastName || ""}
                    onBlur={(e) => saveField("lastName", e.target.value.trim())}
                    disabled={isPending}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input
                  key={`email-${selectedDetail.id}`}
                  type="email"
                  defaultValue={selectedDetail.email || ""}
                  onBlur={(e) => saveField("email", e.target.value.trim())}
                  disabled={isPending}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input
                  key={`phone-${selectedDetail.id}`}
                  type="text"
                  defaultValue={selectedDetail.phone || ""}
                  onBlur={(e) => saveField("phone", e.target.value.trim())}
                  disabled={isPending}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Address</label>
                <textarea
                  key={`address-${selectedDetail.id}`}
                  defaultValue={selectedDetail.address || ""}
                  onBlur={(e) => saveField("address", e.target.value.trim())}
                  disabled={isPending}
                  rows={2}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Invoice language</label>
                <select
                  key={`language-${selectedDetail.id}`}
                  defaultValue={selectedDetail.language || ""}
                  onChange={(e) => saveField("language", e.target.value)}
                  disabled={isPending}
                  className={inputCls}
                >
                  <option value="">Use artist default</option>
                  <option value="EN">English</option>
                  <option value="FR">French</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <textarea
                  key={`notes-${selectedDetail.id}`}
                  defaultValue={selectedDetail.notes || ""}
                  onBlur={(e) => saveField("notes", e.target.value.trim())}
                  disabled={isPending}
                  rows={3}
                  className={inputCls}
                />
              </div>
              {savedField && <p className="text-xs text-green-600">Saved</p>}
            </div>
          </div>
        )}
      </div>

      {/* ---- Customer list (right) ---- */}
      <div className="flex h-full w-[300px] shrink-0 flex-col overflow-y-auto border-l border-neutral-200">
        <div className="border-b border-neutral-200 p-4">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mb-2 w-full rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            + Add Customer
          </button>
          <button
            type="button"
            onClick={() => setImporting(true)}
            className="mb-3 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Import from CSV
          </button>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
          />
          <p className="mt-2 text-[11px] text-neutral-400">
            {customers.length} customer{customers.length === 1 ? "" : "s"}
          </p>
        </div>

        {adding && (
          <form
            action={handleAddContact}
            className="space-y-2 border-b border-neutral-200 bg-neutral-50 p-3"
          >
            <input
              type="text"
              name="firstName"
              placeholder="First name"
              required
              autoFocus
              className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs"
            />
            <input
              type="text"
              name="lastName"
              placeholder="Last name"
              className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs"
            />
            <input
              type="email"
              name="email"
              placeholder="Email (optional)"
              className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs"
            />
            {addError && <p className="text-xs text-red-600">{addError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-700"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setAddError(null);
                }}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-white"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-4 text-xs text-neutral-400">Nothing here yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => openRow(c.id)}
                    className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm ${
                      selectedId === c.id
                        ? "bg-neutral-900 text-white"
                        : "text-neutral-800 hover:bg-neutral-50"
                    }`}
                  >
                    <span className="truncate">{c.name}</span>
                    <span
                      className={`shrink-0 text-xs ${
                        selectedId === c.id ? "text-neutral-300" : "text-neutral-400"
                      }`}
                    >
                      {c.saleCount}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {importing && (
        <CustomerImportPanel
          artistId={artistId}
          onClose={() => setImporting(false)}
          onImported={() => router.refresh()}
        />
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete ${selectedDetail?.name ?? "this customer"}?`}
        message={
          selectedDetail && selectedDetail.purchases.length > 0
            ? `This removes the contact record only — their ${selectedDetail.purchases.length} sale${selectedDetail.purchases.length === 1 ? "" : "s"} stay exactly as they are (invoices, amounts, everything), just no longer linked to a customer record. Can't be undone.`
            : "This removes the contact record. Can't be undone."
        }
        confirmLabel={deleting ? "Deleting…" : "Delete permanently"}
        danger
        onConfirm={handleDeleteCustomer}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
