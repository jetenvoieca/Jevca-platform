"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getGalleryDetail,
  updateCustomer,
  createCustomer,
  type CustomerSummary,
  type GalleryDetail,
  type GalleryConsignedWork,
} from "@/lib/actions/customers";

type RelationshipStatus = "PROSPECT" | "ACTIVE";

const inputCls =
  "w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50";
const labelCls = "mb-1 block text-xs text-neutral-500";

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

  const selectedWork: GalleryConsignedWork | null =
    selectedDetail?.consignedWorks.find((w) => w.id === selectedWorkId) || null;

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

      {/* ---- Gallery details (middle) ---- */}
      <div className="w-[480px] shrink-0 overflow-y-auto border-l border-neutral-200 p-6">
        {!selectedId ? (
          <p className="text-sm text-neutral-400">Select a gallery to see its details.</p>
        ) : loading || !selectedDetail ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : (
          <div>
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

            <div className="space-y-3">
              <div>
                <label className={labelCls}>Relationship</label>
                <div className="flex overflow-hidden rounded-md border border-neutral-300 text-sm">
                  {(["PROSPECT", "ACTIVE"] as RelationshipStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={isPending}
                      onClick={() => saveField("relationshipStatus", s)}
                      className={`flex-1 px-3 py-1.5 disabled:opacity-50 ${
                        selectedDetail.relationshipStatus === s
                          ? "bg-neutral-900 text-white"
                          : "bg-white text-neutral-600 hover:bg-neutral-50"
                      }`}
                    >
                      {s === "ACTIVE" ? "Active" : "Prospect"}
                    </button>
                  ))}
                </div>
              </div>

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
                <p className="mt-1 text-xs text-neutral-400">
                  Renaming updates which works show as consigned here — matched by this exact
                  name against each artwork&apos;s Location.
                </p>
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

              <div className="space-y-3 rounded-md border border-neutral-200 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Gallery details
                </p>
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
                  <p className="mt-1 text-xs text-neutral-400">
                    A starting point when recording a sale through this gallery — each sale can
                    still have its own commission typed in if it differs.
                  </p>
                </div>
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
    </div>
  );
}
