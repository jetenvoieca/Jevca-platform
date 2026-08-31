"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getGalleryDetail,
  updateCustomer,
  createCustomer,
  deleteCustomer,
  type CustomerSummary,
  type GalleryDetail,
  type GalleryConsignedWork,
} from "@/lib/actions/customers";
import ConfirmDialog from "@/components/ConfirmDialog";

type DetailTab = "details" | "sales";

const inputCls =
  "w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50";
const labelCls = "mb-1 block text-xs text-neutral-500";

function formatMoney(amount: string, currency: string) {
  const n = parseFloat(amount);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
}

// Same "UNPAID" label/styling as the active-gallery-sale badge in
// PurchasePanel — kept identical on purpose so the word means the same
// thing everywhere in the app, rather than introducing a second phrase
// for the same status (2026-08-31).
function SaleStatusBadge({ status }: { status: "ACTIVE" | "COMPLETED" | "ABANDONED" }) {
  if (status === "COMPLETED") {
    return <span className="text-sm text-green-600">Completed</span>;
  }
  if (status === "ABANDONED") {
    return <span className="text-sm text-neutral-400">Abandoned</span>;
  }
  return (
    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      UNPAID
    </span>
  );
}

export default function GalleriesView({
  siteId,
  artistId,
  galleries,
}: {
  siteId: string;
  artistId: string;
  galleries: CustomerSummary[];
}) {
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<GalleryDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [savedField, setSavedField] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("details");
  const router = useRouter();

  const filtered = galleries.filter((g) => {
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return g.name.toLowerCase().includes(needle) || (g.email || "").toLowerCase().includes(needle);
  });

  const openRow = (customerId: string) => {
    setSelectedId(customerId);
    setSelectedDetail(null);
    setSelectedWorkId(null);
    setDetailTab("details");
    setLoading(true);
    getGalleryDetail(customerId).then((detail) => {
      setSelectedDetail(detail);
      setLoading(false);
    });
  };

  const saveField = (
    field:
      | "name"
      | "email"
      | "phone"
      | "address"
      | "language"
      | "notes"
      | "contactName"
      | "contactEmail"
      | "websiteName"
      | "websiteUrl"
      | "instagramUrl"
      | "facebookUrl"
      | "defaultCommissionPercent"
      | "relationshipStatus",
    value: string
  ) => {
    if (!selectedDetail) return;
    const fd = new FormData();
    fd.set("kind", "GALLERY");
    fd.set("name", field === "name" ? value : selectedDetail.name);
    fd.set("email", field === "email" ? value : selectedDetail.email || "");
    fd.set("phone", field === "phone" ? value : selectedDetail.phone || "");
    fd.set("address", field === "address" ? value : selectedDetail.address || "");
    // language, notes and relationshipStatus have no fields in this panel
    // any more (removed 2026-08-31 — not needed for how Galleries are
    // actually used), but their stored values still need to be resent
    // here on every save, otherwise they'd be silently wiped to blank
    // the next time any other field on this form is edited.
    fd.set("language", field === "language" ? value : selectedDetail.language || "");
    fd.set("notes", field === "notes" ? value : selectedDetail.notes || "");
    fd.set("contactName", field === "contactName" ? value : selectedDetail.contactName || "");
    fd.set("contactEmail", field === "contactEmail" ? value : selectedDetail.contactEmail || "");
    fd.set("websiteName", field === "websiteName" ? value : selectedDetail.websiteName || "");
    fd.set("websiteUrl", field === "websiteUrl" ? value : selectedDetail.websiteUrl || "");
    fd.set("instagramUrl", field === "instagramUrl" ? value : selectedDetail.instagramUrl || "");
    fd.set("facebookUrl", field === "facebookUrl" ? value : selectedDetail.facebookUrl || "");
    fd.set(
      "defaultCommissionPercent",
      field === "defaultCommissionPercent" ? value : selectedDetail.defaultCommissionPercent || ""
    );
    fd.set(
      "relationshipStatus",
      field === "relationshipStatus" ? value : selectedDetail.relationshipStatus || "PROSPECT"
    );

    startTransition(async () => {
      await updateCustomer(selectedDetail.id, fd);
      router.refresh();
      // A rename directly affects which artworks show as Consigned
      // Works below (matched by exact name — see getGalleryDetail), so
      // re-fetch rather than just patching local state for that one
      // field, to keep the two panels honest with each other.
      if (field === "name") {
        openRow(selectedDetail.id);
      } else {
        setSelectedDetail((prev) => (prev ? { ...prev, [field]: value || null } : prev));
      }
      setSavedField(field);
      setTimeout(() => setSavedField(null), 1500);
    });
  };

  const handleAddGallery = async (formData: FormData) => {
    setAddError(null);
    formData.set("kind", "GALLERY");
    const result = await createCustomer(artistId, formData);
    if ("error" in result) {
      setAddError(result.error);
      return;
    }
    setAdding(false);
    router.refresh();
    openRow(result.id);
  };

  const handleDeleteGallery = () => {
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

  const selectedWork: GalleryConsignedWork | null =
    selectedDetail?.consignedWorks.find((w) => w.id === selectedWorkId) || null;

  // Sum of every sale linked to this gallery, regardless of status —
  // "all invoices", not just completed ones (2026-08-31 decision). Kept
  // separate per currency rather than added together, same reasoning as
  // the main Sales page.
  const salesByCurrency: Record<string, number> = {};
  if (selectedDetail) {
    for (const p of selectedDetail.purchases) {
      salesByCurrency[p.currency] = (salesByCurrency[p.currency] || 0) + parseFloat(p.totalAmount);
    }
  }
  const salesSummary = !selectedDetail
    ? ""
    : selectedDetail.purchases.length === 0
      ? "No sales yet."
      : `${selectedDetail.purchases.length} sale${selectedDetail.purchases.length === 1 ? "" : "s"} · ${Object.entries(
          salesByCurrency
        )
          .map(([cur, amt]) => formatMoney(amt.toFixed(2), cur))
          .join(" · ")}`;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ---- Consigned Works (left) ---- */}
      <div className="flex-1 overflow-y-auto p-6">
        <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Consigned Works</h1>
        {!selectedDetail ? (
          <p className="text-sm text-neutral-400">
            Select a gallery to see the works currently consigned there.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-neutral-500">
              At {selectedDetail.name} — matched from each artwork&apos;s Location field in the
              Artwork Catalogue, so an artwork shows up here the moment its Location is set to
              this gallery&apos;s name.
            </p>
            <div className="flex gap-6">
              <div className="flex-1">
                {selectedDetail.consignedWorks.length === 0 ? (
                  <p className="text-sm text-neutral-400">
                    Nothing currently has its Location set to this gallery.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {selectedDetail.consignedWorks.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => setSelectedWorkId(w.id)}
                        className={`w-28 shrink-0 rounded-lg border-2 p-1 text-left ${
                          selectedWorkId === w.id
                            ? "border-neutral-900"
                            : "border-transparent hover:border-neutral-200"
                        }`}
                      >
                        <div className="aspect-square overflow-hidden rounded-md bg-neutral-100">
                          {w.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={w.imageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <p className="mt-1.5 truncate text-xs font-medium text-neutral-900">
                          {w.presentationTitle}
                        </p>
                        <p className="text-xs text-neutral-400">
                          {w.presentationPrice ? `£${w.presentationPrice}` : "—"}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedWork && (
                <div className="w-80 shrink-0 rounded-lg border border-neutral-200 p-4">
                  <p className="mb-2 text-sm font-semibold text-neutral-900">
                    {selectedWork.presentationTitle}
                  </p>
                  <dl className="space-y-1.5 text-xs text-neutral-500">
                    {selectedWork.medium && (
                      <div>
                        <dt className="inline text-neutral-400">Medium: </dt>
                        <dd className="inline">{selectedWork.medium}</dd>
                      </div>
                    )}
                    {selectedWork.size && (
                      <div>
                        <dt className="inline text-neutral-400">Size: </dt>
                        <dd className="inline">{selectedWork.size}</dd>
                      </div>
                    )}
                    {selectedWork.presentationPrice && (
                      <div>
                        <dt className="inline text-neutral-400">Price: </dt>
                        <dd className="inline">£{selectedWork.presentationPrice}</dd>
                      </div>
                    )}
                    {selectedWork.description && (
                      <p className="pt-2 text-neutral-600">{selectedWork.description}</p>
                    )}
                  </dl>
                  <p className="mt-3 text-[11px] text-neutral-400">
                    Read-only for now — management actions (mark returned, mark sold from here)
                    come once this first workflow is confirmed.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ---- Gallery details / sales (middle) ---- */}
      <div className="w-[480px] shrink-0 overflow-y-auto border-l border-neutral-200 p-6">
        {!selectedId ? (
          <p className="text-sm text-neutral-400">Select a gallery to see its details.</p>
        ) : loading || !selectedDetail ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">{selectedDetail.name}</h2>
              <div className="flex items-center gap-3">
                <div className="flex overflow-hidden rounded-full border border-neutral-300 text-xs">
                  <button
                    type="button"
                    onClick={() => setDetailTab("details")}
                    className={`px-3 py-1 font-medium ${
                      detailTab === "details"
                        ? "bg-neutral-900 text-white"
                        : "bg-white text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    Details
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailTab("sales")}
                    className={`px-3 py-1 font-medium ${
                      detailTab === "sales"
                        ? "bg-neutral-900 text-white"
                        : "bg-white text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    Sales
                  </button>
                </div>
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

            {detailTab === "sales" ? (
              <div>
                <p className="mb-4 text-sm text-neutral-500">{salesSummary}</p>
                <div className="overflow-hidden rounded-lg border border-neutral-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-400">
                        <th className="px-3 py-2 font-normal">Artwork</th>
                        <th className="px-3 py-2 font-normal">Status</th>
                        <th className="px-3 py-2 font-normal">Amount</th>
                        <th className="px-3 py-2 font-normal">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDetail.purchases.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-sm text-neutral-400">
                            Nothing here yet.
                          </td>
                        </tr>
                      ) : (
                        selectedDetail.purchases.map((p) => (
                          <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {p.artworkImageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={p.artworkImageUrl}
                                    alt=""
                                    className="h-8 w-8 shrink-0 rounded object-cover"
                                  />
                                ) : (
                                  <div className="h-8 w-8 shrink-0 rounded bg-neutral-100" />
                                )}
                                <span className="truncate">{p.artworkTitle}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <SaleStatusBadge status={p.status} />
                            </td>
                            <td className="px-3 py-2 text-neutral-800">
                              {formatMoney(p.totalAmount, p.currency)}
                            </td>
                            <td className="px-3 py-2 text-neutral-400">
                              {new Date(p.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Gallery name</label>
                  <input
                    key={`name-${selectedDetail.id}`}
                    type="text"
                    defaultValue={selectedDetail.name}
                    onBlur={(e) => saveField("name", e.target.value.trim())}
                    disabled={isPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>General email</label>
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
                  <label className={labelCls}>Contact name</label>
                  <input
                    key={`contactName-${selectedDetail.id}`}
                    type="text"
                    defaultValue={selectedDetail.contactName || ""}
                    onBlur={(e) => saveField("contactName", e.target.value.trim())}
                    disabled={isPending}
                    placeholder="The person you deal with there"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Contact email</label>
                  <input
                    key={`contactEmail-${selectedDetail.id}`}
                    type="email"
                    defaultValue={selectedDetail.contactEmail || ""}
                    onBlur={(e) => saveField("contactEmail", e.target.value.trim())}
                    disabled={isPending}
                    className={inputCls}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Website name</label>
                    <input
                      key={`websiteName-${selectedDetail.id}`}
                      type="text"
                      defaultValue={selectedDetail.websiteName || ""}
                      onBlur={(e) => saveField("websiteName", e.target.value.trim())}
                      disabled={isPending}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Website URL</label>
                    <input
                      key={`websiteUrl-${selectedDetail.id}`}
                      type="text"
                      defaultValue={selectedDetail.websiteUrl || ""}
                      onBlur={(e) => saveField("websiteUrl", e.target.value.trim())}
                      disabled={isPending}
                      placeholder="https://…"
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Instagram</label>
                    <input
                      key={`instagramUrl-${selectedDetail.id}`}
                      type="text"
                      defaultValue={selectedDetail.instagramUrl || ""}
                      onBlur={(e) => saveField("instagramUrl", e.target.value.trim())}
                      disabled={isPending}
                      placeholder="https://instagram.com/…"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Facebook</label>
                    <input
                      key={`facebookUrl-${selectedDetail.id}`}
                      type="text"
                      defaultValue={selectedDetail.facebookUrl || ""}
                      onBlur={(e) => saveField("facebookUrl", e.target.value.trim())}
                      disabled={isPending}
                      placeholder="https://facebook.com/…"
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Default commission %</label>
                  <input
                    key={`defaultCommissionPercent-${selectedDetail.id}`}
                    type="text"
                    inputMode="decimal"
                    defaultValue={selectedDetail.defaultCommissionPercent || ""}
                    onBlur={(e) => saveField("defaultCommissionPercent", e.target.value.trim())}
                    disabled={isPending}
                    placeholder="e.g. 30"
                    className={inputCls}
                  />
                </div>
                {savedField && <p className="text-xs text-green-600">Saved</p>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Gallery list (right) ---- */}
      <div className="flex h-full w-[300px] shrink-0 flex-col overflow-y-auto border-l border-neutral-200">
        <div className="border-b border-neutral-200 p-4">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mb-3 w-full rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            + Add Gallery
          </button>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
          />
          <p className="mt-2 text-[11px] text-neutral-400">
            {galleries.length} galler{galleries.length === 1 ? "y" : "ies"}
          </p>
        </div>

        {adding && (
          <form
            action={handleAddGallery}
            className="space-y-2 border-b border-neutral-200 bg-neutral-50 p-3"
          >
            <input
              type="text"
              name="name"
              placeholder="Gallery name"
              required
              autoFocus
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
              {filtered.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => openRow(g.id)}
                    className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm ${
                      selectedId === g.id
                        ? "bg-neutral-900 text-white"
                        : "text-neutral-800 hover:bg-neutral-50"
                    }`}
                  >
                    <span className="truncate">{g.name}</span>
                    {g.relationshipStatus && (
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          selectedId === g.id
                            ? "bg-white/20 text-white"
                            : g.relationshipStatus === "ACTIVE"
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {g.relationshipStatus === "ACTIVE" ? "Active" : "Prospect"}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete ${selectedDetail?.name ?? "this gallery"}?`}
        message={
          selectedDetail && selectedDetail.purchases.length > 0
            ? `This removes the contact record only — their ${selectedDetail.purchases.length} sale${selectedDetail.purchases.length === 1 ? "" : "s"} stay exactly as they are (invoices, amounts, everything), just no longer linked to a customer record. Consigned Works (matched by name, not a real link) are unaffected either way. Can't be undone.`
            : "This removes the contact record. Can't be undone."
        }
        confirmLabel={deleting ? "Deleting…" : "Delete permanently"}
        danger
        onConfirm={handleDeleteGallery}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
