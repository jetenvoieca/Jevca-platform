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
} from "@/lib/actions/customers";
import { getArtworkDetailForClient } from "@/lib/actions/artworks";
import {
  startGallerySale,
  updateGallerySaleAmount,
  type PurchaseDetail,
} from "@/lib/actions/payments";
import type { ArtworkDetail } from "@/components/ArtworkDetailPanel";
import ConfirmDialog from "@/components/ConfirmDialog";
import GallerySaleCard, { SaleStatusBadge } from "@/components/GallerySaleCard";

type DetailTab = "details" | "sales";

const inputCls =
  "w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50";
const labelCls = "mb-1 block text-xs text-neutral-500";

function formatMoney(amount: string, currency: string) {
  const n = parseFloat(amount);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
}

export default function GalleriesView({
  siteId,
  artistId,
  galleries,
  paymentMethods,
}: {
  siteId: string;
  artistId: string;
  galleries: CustomerSummary[];
  // Offered in GallerySaleCard's "Mark as paid" Method dropdown
  // (2026-09-03) — Settings-editable, same list the Payment Methods
  // card on the Artwork Catalogue's Settings screen manages.
  paymentMethods: string[];
}) {
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<GalleryDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [savedField, setSavedField] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Defaults to "sales" (2026-09-09, direct request) — the sales history
  // is what's checked on opening a gallery day to day; Details (contact
  // info, address) is looked up far less often. openRow below (fired
  // every time a gallery is clicked) resets to this same value too —
  // this initial useState only covers the very first render, before any
  // gallery has been selected at all.
  const [detailTab, setDetailTab] = useState<DetailTab>("sales");
  const router = useRouter();

  // ---- Consigned Works control panel (2026-08-31, Part Two) ----
  // Clicking a consigned artwork fetches its own full detail (same call
  // the Artwork Catalogue itself uses) so this panel can tell whether
  // it already has a sale on it — a blank "Start a sale" form only ever
  // shows for an artwork with no active sale; otherwise its live status
  // shows instead (via GallerySaleCard, 2026-09-03). Kept as a separate
  // fetch/loading pair from the gallery's own selectedDetail above,
  // since they're genuinely different records (Customer vs Artwork).
  //
  // Shown in its own modal (2026-09-10) — was an inline w-80 panel next
  // to the grid, but that meant the grid itself had to shrink to make
  // room for it every time a work was open. As a modal it can be as
  // roomy as it needs without stealing grid width, and the grid stays
  // full-width whether or not a work is currently selected.
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [selectedWorkDetail, setSelectedWorkDetail] = useState<ArtworkDetail | null>(null);
  const [workLoading, setWorkLoading] = useState(false);
  const [workPending, startWorkTransition] = useTransition();
  const [saleError, setSaleError] = useState<string | null>(null);
  const [saleTotalAmount, setSaleTotalAmount] = useState("");
  const [saleCurrency, setSaleCurrency] = useState("GBP");
  const [saleCommission, setSaleCommission] = useState("");
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));

  // ---- Edit Sale popup — price/currency only, ACTIVE sales only
  // (2026-09-12 mockup) ----
  const [showEditSale, setShowEditSale] = useState(false);
  const [editPrice, setEditPrice] = useState("");
  const [editCurrency, setEditCurrency] = useState("GBP");
  const [editSaleError, setEditSaleError] = useState<string | null>(null);

  const filtered = galleries.filter((g) => {
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return g.name.toLowerCase().includes(needle) || (g.email || "").toLowerCase().includes(needle);
  });

  const openRow = (customerId: string) => {
    setSelectedId(customerId);
    setSelectedDetail(null);
    setSelectedWorkId(null);
    setSelectedWorkDetail(null);
    // Was resetting to "details" here (2026-09-09 fix) — this ran on
    // every gallery click and was silently overriding the "sales"
    // default above, so the panel always opened on Details regardless.
    setDetailTab("sales");
    setLoading(true);
    getGalleryDetail(customerId).then((detail) => {
      setSelectedDetail(detail);
      setLoading(false);
    });
  };

  // Re-fetches just the gallery's own detail (used after a sale action,
  // to keep the Sales tab's totals/list in sync) without disturbing
  // whichever consigned work is currently open — unlike openRow above,
  // which is specifically for switching to a different gallery.
  const refreshGalleryDetail = (customerId: string) => {
    getGalleryDetail(customerId).then((detail) => setSelectedDetail(detail));
  };

  const openWork = (workId: string) => {
    setSelectedWorkId(workId);
    setSelectedWorkDetail(null);
    setWorkLoading(true);
    setSaleError(null);
    setSaleTotalAmount("");
    setSaleCurrency("GBP");
    // Defaults to this gallery's own default commission — still
    // editable per sale, same "starting point, not binding" idea as
    // everywhere else this default is used.
    setSaleCommission(selectedDetail?.defaultCommissionPercent || "");
    setSaleDate(new Date().toISOString().slice(0, 10));
    // Edit Sale popup always starts closed on a freshly-opened work —
    // it's re-populated from that work's own active purchase the moment
    // "Edit Sale" is actually clicked (see handleOpenEditSale below).
    setShowEditSale(false);
    setEditSaleError(null);
    getArtworkDetailForClient(workId).then((detail) => {
      setSelectedWorkDetail(detail);
      // Sale price defaults to the artwork's own listed price
      // (2026-09-03) — still fully editable before "Start sale" is
      // pressed, this just saves retyping a figure that's almost always
      // the same as what's already on the Catalogue. Only meaningful for
      // the blank "Start a sale" form (no active/completed purchase);
      // harmless to set unconditionally since saleTotalAmount is never
      // read once a sale already exists.
      setSaleTotalAmount(detail?.presentationPrice || "");
      setWorkLoading(false);
    });
  };

  // Refetches this work's detail (to pick up any change GallerySaleCard
  // or the Edit Sale popup just made — paid, sent, cancelled, deleted,
  // link generated, price/currency edited) and the gallery's own detail
  // (its Sales tab reads from the same Purchase rows), so the panels
  // never fall out of sync with each other.
  const refreshAfterSaleChange = () => {
    if (!selectedWorkId || !selectedId) return;
    getArtworkDetailForClient(selectedWorkId).then((detail) => setSelectedWorkDetail(detail));
    refreshGalleryDetail(selectedId);
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
      | "defaultCommissionPercent",
    value: string
  ) => {
    if (!selectedDetail) return;
    const fd = new FormData();
    fd.set("kind", "GALLERY");
    fd.set("name", field === "name" ? value : selectedDetail.name);
    fd.set("email", field === "email" ? value : selectedDetail.email || "");
    fd.set("phone", field === "phone" ? value : selectedDetail.phone || "");
    fd.set("address", field === "address" ? value : selectedDetail.address || "");
    // language and notes have no fields in this panel any more (removed
    // 2026-08-31 — not needed for how Galleries are actually used), but
    // their stored values still need to be resent here on every save,
    // otherwise they'd be silently wiped to blank the next time any
    // other field on this form is edited. (relationshipStatus used to
    // need the same treatment, for the same reason — removed 2026-09-02
    // along with the list's Active/Prospect badge, its last reader.)
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

  // ---- Starting a gallery sale for a consigned work ----
  // Once a sale exists (active or completed), managing it entirely goes
  // through GallerySaleCard below — this is only ever reached from the
  // blank "Start a sale" form, before any Purchase exists yet.

  const handleStartSale = () => {
    if (!selectedWorkId || !selectedId) return;
    if (!saleTotalAmount.trim()) {
      setSaleError("The sale price is required.");
      return;
    }
    setSaleError(null);
    const fd = new FormData();
    fd.set("totalAmount", saleTotalAmount.trim());
    fd.set("currency", saleCurrency);
    fd.set("commissionPercent", saleCommission.trim());
    fd.set("saleDate", saleDate);
    startWorkTransition(async () => {
      const res = await startGallerySale(selectedWorkId, selectedId, siteId, fd);
      if (!res.ok) {
        setSaleError(res.error);
        return;
      }
      const detail = await getArtworkDetailForClient(selectedWorkId);
      setSelectedWorkDetail(detail);
      refreshGalleryDetail(selectedId);
      router.refresh();
    });
  };

  const activeWorkPurchase = selectedWorkDetail?.activePurchase ?? null;
  // A sale that's already been marked paid, for the artwork currently
  // open — only looked up when there's no active purchase, since active
  // always takes priority. purchaseHistory is already ordered
  // most-recent-first (same query ordering as activePurchase itself), so
  // this is genuinely the latest completed gallery sale, not just any
  // past one — relevant for a piece that's been consigned, sold,
  // returned, and consigned again.
  const completedGallerySale: PurchaseDetail | null = !activeWorkPurchase
    ? (selectedWorkDetail?.purchaseHistory.find(
        (p) => p.channel === "GALLERY" && p.status === "COMPLETED"
      ) ?? null)
    : null;

  const saleAmountNum = parseFloat(saleTotalAmount) || 0;
  const saleCommissionNum = parseFloat(saleCommission) || 0;
  const saleNetOwed = saleAmountNum - saleAmountNum * (saleCommissionNum / 100);

  // ---- Edit Sale popup handlers ----
  // Only ever shown for an ACTIVE gallery sale (confirmed decision,
  // 2026-09-12) — once paid, the amount is a locked financial record.
  const canEditSale =
    activeWorkPurchase !== null &&
    activeWorkPurchase.channel === "GALLERY" &&
    activeWorkPurchase.status === "ACTIVE";

  const handleOpenEditSale = () => {
    if (!activeWorkPurchase) return;
    setEditPrice(activeWorkPurchase.totalAmount);
    setEditCurrency(activeWorkPurchase.currency);
    setEditSaleError(null);
    setShowEditSale(true);
  };

  // Autosaves a single field (matches the same defaultValue/onBlur
  // pattern the Gallery Details tab already uses above) — always sends
  // both totalAmount and currency together since updateGallerySaleAmount
  // updates the whole row, using whichever value wasn't just edited.
  const saveEditSaleField = (field: "totalAmount" | "currency", value: string) => {
    if (!activeWorkPurchase) return;
    setEditSaleError(null);
    const fd = new FormData();
    fd.set("totalAmount", field === "totalAmount" ? value : editPrice);
    fd.set("currency", field === "currency" ? value : editCurrency);
    startWorkTransition(async () => {
      const res = await updateGallerySaleAmount(activeWorkPurchase.id, siteId, fd);
      if (!res.ok) {
        setEditSaleError(res.error);
        return;
      }
      refreshAfterSaleChange();
    });
  };

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

  // Which consigned works have a completed gallery sale on record
  // (2026-09-03) — drawn straight from selectedDetail.purchases (which
  // already has artworkId per row) rather than a separate query, so the
  // "SOLD" ribbon below stays in sync with the Sales tab table for free.
  const soldWorkIds = new Set(
    (selectedDetail?.purchases ?? [])
      .filter((p) => p.channel === "GALLERY" && p.status === "COMPLETED")
      .map((p) => p.artworkId)
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* ---- Consigned Works (left) ---- */}
      {/* Grid only now (2026-09-10) — the per-work detail/action panel
          moved into its own modal below, so the grid no longer has to
          give up a w-80 slice of its own width whenever a work is
          selected; it's always full width. */}
      <div className="flex flex-1 flex-col overflow-hidden p-6">
        <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Consigned Works</h1>
        {!selectedDetail ? (
          <p className="text-sm text-neutral-400">
            Select a gallery to see the works currently consigned there.
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto">
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
                    onClick={() => openWork(w.id)}
                    className={`w-28 shrink-0 rounded-lg border-2 p-1 text-left ${
                      selectedWorkId === w.id
                        ? "border-neutral-900"
                        : "border-transparent hover:border-neutral-200"
                    }`}
                  >
                    <div className="relative aspect-square overflow-hidden rounded-md bg-neutral-100">
                      {w.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={w.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : null}
                      {/* SOLD ribbon — only for a completed gallery
                          sale, not just an active (UNPAID) one. */}
                      {soldWorkIds.has(w.id) && (
                        <span className="absolute right-1 top-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Sold
                        </span>
                      )}
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
        )}
      </div>

      {/* ---- Gallery details / sales (middle) ---- */}
      {/* Back to a permanent column (2026-09-10) — stays put here, just
          widened 25% (600px, up from 480px) to leave room for whatever
          gets added next. Headers never scroll (2026-09-09) — the
          name/tabs/Delete/Close row is fixed (shrink-0) and only the
          tab content underneath scrolls. */}
      <div className="flex w-[600px] shrink-0 flex-col overflow-hidden border-l border-neutral-200 p-6">
        {!selectedId ? (
          <p className="text-sm text-neutral-400">Select a gallery to see its details.</p>
        ) : loading || !selectedDetail ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">{selectedDetail.name}</h2>
              <div className="flex items-center gap-3">
                <div className="flex overflow-hidden rounded-full border border-neutral-300 text-xs">
                  <button
                    type="button"
                    onClick={() => setDetailTab("details")}
                    className={`px-3 py-[2px] font-medium ${
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
                    className={`px-3 py-[2px] font-medium ${
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
                  className="rounded-md border border-red-200 px-2 py-[2px] text-xs text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    setSelectedDetail(null);
                  }}
                  className="rounded-md border border-neutral-300 px-2 py-[2px] text-xs hover:bg-neutral-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
            {detailTab === "sales" ? (
              <div>
                <p className="mb-4 text-sm text-neutral-500">{salesSummary}</p>
                <div className="overflow-hidden rounded-lg border border-neutral-200">
                  {/* table-fixed + explicit column widths (2026-09-10) —
                      table-auto let a long artwork title grow the
                      Artwork column and push Date off the visible edge
                      of this panel. Artwork now truncates within its own
                      reserved width instead, so Status/Amount/Date
                      always stay on screen regardless of title length
                      or window size. */}
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col className="w-[42%]" />
                      <col className="w-[20%]" />
                      <col className="w-[19%]" />
                      <col className="w-[19%]" />
                    </colgroup>
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
                          // Clicking a row opens that artwork's detail
                          // modal — same as clicking its thumbnail in
                          // the Consigned Works grid, just reachable
                          // from this table too.
                          <tr
                            key={p.id}
                            onClick={() => openWork(p.artworkId)}
                            className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                          >
                            <td className="px-3 py-2">
                              <div className="flex min-w-0 items-center gap-2">
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
                                <span className="min-w-0 truncate">{p.artworkTitle}</span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              <SaleStatusBadge status={p.status} invoiceEmailedAt={p.invoiceEmailedAt} />
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-neutral-800">
                              {formatMoney(p.totalAmount, p.currency)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-neutral-400">
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
          </div>
        )}
      </div>

      {/* ---- Gallery list (right) ---- */}
      {/* overflow-hidden, not overflow-y-auto — headers never scroll
          (2026-09-09). The "+ Add Gallery"/search block below is fixed;
          only the list itself (its own flex-1 overflow-y-auto further
          down) scrolls. */}
      <div className="flex h-full w-[300px] shrink-0 flex-col overflow-hidden border-l border-neutral-200">
        <div className="border-b border-neutral-200 p-4">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mb-3 w-full rounded-md bg-neutral-900 px-3 py-[4px] text-sm font-medium text-white hover:bg-neutral-700"
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
                className="flex-1 rounded-md bg-neutral-900 px-2 py-[2px] text-xs font-medium text-white hover:bg-neutral-700"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setAddError(null);
                }}
                className="rounded-md border border-neutral-300 px-2 py-[2px] text-xs hover:bg-white"
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
                    className={`flex w-full items-center justify-between gap-2 px-4 py-[7px] text-left text-sm ${
                      selectedId === g.id
                        ? "bg-[#E7E7E7] text-neutral-900"
                        : "text-neutral-800 hover:bg-neutral-50"
                    }`}
                  >
                    <span className="truncate">{g.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ---- Artwork detail / sale actions modal (2026-09-10) ---- */}
      {/* Was the inline w-80 panel next to the grid; moved here so the
          grid can stay full width regardless of whether a work is
          selected. Opens on the same openWork() call as before (grid
          thumbnail or a Sales table row), and closes the same way
          (clearing selectedWorkId/selectedWorkDetail). */}
      {selectedWorkId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="flex max-h-[85vh] w-full max-w-[420px] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            {workLoading || !selectedWorkDetail ? (
              <p className="p-6 text-sm text-neutral-400">Loading…</p>
            ) : (
              <>
                {/* relative so the Edit Sale popup (2026-09-12 mockup)
                    can anchor itself under the header via absolute
                    positioning. */}
                <div className="relative flex shrink-0 items-start justify-between gap-2 border-b border-neutral-200 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">
                      {selectedWorkDetail.presentationTitle}
                    </p>
                    {/* Catalogue number (2026-09-10, direct request) —
                        same "Catalogue #…" wording ArtworkDetailPanel
                        already uses, so it reads as the same field
                        wherever it shows up. */}
                    <p className="text-xs text-neutral-400">
                      Catalogue #{selectedWorkDetail.catalogueNumber}
                    </p>
                    {(selectedWorkDetail.type || selectedWorkDetail.edition) && (
                      <p className="mt-1 text-xs text-neutral-400">
                        {selectedWorkDetail.type}
                        {selectedWorkDetail.type && selectedWorkDetail.edition ? " - " : ""}
                        {selectedWorkDetail.edition}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Edit Sale (2026-09-12 mockup) — only while the
                        sale is still ACTIVE/UNPAID; price/currency only,
                        nothing else. */}
                    {canEditSale && (
                      <button
                        type="button"
                        onClick={handleOpenEditSale}
                        className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                      >
                        Edit Sale
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedWorkId(null);
                        setSelectedWorkDetail(null);
                      }}
                      className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                    >
                      Close
                    </button>
                  </div>

                  {showEditSale && activeWorkPurchase && (
                    <>
                      {/* Invisible click-outside layer — closes just the
                          popup, not the whole artwork modal. */}
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowEditSale(false)}
                      />
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-5 top-full z-50 mt-1 w-64 rounded-md border border-neutral-200 bg-[#F9F6EE] p-3 shadow-lg"
                      >
                        <p className="mb-2 text-xs font-semibold text-[#5E5E5E]">Edit Sale</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="mb-1 block text-xs text-[#5E5E5E]">Price</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                              onBlur={(e) => saveEditSaleField("totalAmount", e.target.value.trim())}
                              disabled={workPending}
                              className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-[#5E5E5E] disabled:opacity-50"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-[#5E5E5E]">Currency</label>
                            <select
                              value={editCurrency}
                              onChange={(e) => {
                                setEditCurrency(e.target.value);
                                saveEditSaleField("currency", e.target.value);
                              }}
                              disabled={workPending}
                              className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-[#5E5E5E] disabled:opacity-50"
                            >
                              <option value="GBP">GBP</option>
                              <option value="EUR">EUR</option>
                            </select>
                          </div>
                        </div>
                        {editSaleError && (
                          <p className="mt-2 text-xs text-red-600">{editSaleError}</p>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  <dl className="mb-4 space-y-1 text-xs text-neutral-500">
                    {selectedWorkDetail.size && (
                      <div>
                        <dt className="inline text-neutral-400">Size: </dt>
                        <dd className="inline">{selectedWorkDetail.size}</dd>
                      </div>
                    )}
                    {selectedWorkDetail.presentationPrice && (
                      <div>
                        <dt className="inline text-neutral-400">Price: </dt>
                        <dd className="inline">£{selectedWorkDetail.presentationPrice}</dd>
                      </div>
                    )}
                  </dl>

                  {activeWorkPurchase ? (
                    activeWorkPurchase.channel === "GALLERY" ? (
                      <GallerySaleCard
                        purchase={activeWorkPurchase}
                        siteId={siteId}
                        paymentMethods={paymentMethods}
                        onChanged={refreshAfterSaleChange}
                      />
                    ) : (
                      <p className="text-sm text-neutral-500">
                        This artwork already has an active Stripe sale in progress — manage
                        it from the Artwork Catalogue&apos;s Payment tab.
                      </p>
                    )
                  ) : completedGallerySale ? (
                    <GallerySaleCard
                      purchase={completedGallerySale}
                      siteId={siteId}
                      paymentMethods={paymentMethods}
                      onChanged={refreshAfterSaleChange}
                    />
                  ) : (
                    <div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={labelCls}>Sale price</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={saleTotalAmount}
                            onChange={(e) => setSaleTotalAmount(e.target.value)}
                            placeholder="e.g. 250.00"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Currency</label>
                          <select
                            value={saleCurrency}
                            onChange={(e) => setSaleCurrency(e.target.value)}
                            className={inputCls}
                          >
                            <option value="GBP">GBP</option>
                            <option value="EUR">EUR</option>
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Commission %</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={saleCommission}
                            onChange={(e) => setSaleCommission(e.target.value)}
                            placeholder="e.g. 45"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Net owed</label>
                          <input
                            type="text"
                            readOnly
                            value={saleAmountNum ? formatMoney(saleNetOwed.toFixed(2), saleCurrency) : "—"}
                            className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm text-neutral-500"
                          />
                        </div>
                      </div>
                      <div className="mt-2">
                        <label className={labelCls}>Date</label>
                        <input
                          type="date"
                          value={saleDate}
                          onChange={(e) => setSaleDate(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                      {saleError && <p className="mt-2 text-xs text-red-600">{saleError}</p>}
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={handleStartSale}
                          disabled={workPending || !saleTotalAmount.trim()}
                          className="w-full rounded-md bg-neutral-900 px-3 py-[6px] text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                        >
                          Start sale
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
