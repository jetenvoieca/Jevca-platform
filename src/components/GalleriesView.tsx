"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getGalleryDetail,
  updateCustomer,
  type GalleryDetail,
} from "@/lib/actions/customers";
import {
  createLocation,
  renameLocationByCustomer,
  deleteLocationByCustomer,
  type LocationCustomerSummary,
  type LocationType,
} from "@/lib/actions/locations";
import { getArtworkDetailForClient } from "@/lib/actions/artworks";
import { startGallerySale, type PurchaseDetail } from "@/lib/actions/payments";
import { netOwed } from "@/lib/saleMath";
import { formatDate } from "@/lib/formatDate";
import type { ArtworkDetail } from "@/components/ArtworkDetailPanel";
import ConfirmDialog from "@/components/ConfirmDialog";
import GallerySaleCard, { SaleStatusBadge } from "@/components/GallerySaleCard";
import SaleHeader from "@/components/SaleHeader";

type DetailTab = "details" | "sales";

// Below xl (1280px — covers iPad in both orientations, where the fixed
// 600px + 300px side columns leave no usable room for the works grid),
// the three columns below are shown one at a time instead of side by
// side: Location list -> Consigned Works -> Details/Sales. This state
// drives which one is visible; it's simply ignored at xl and above,
// where all three show together as before.
type MobileStep = "list" | "works" | "details";

const inputCls =
  "w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50";
const labelCls = "mb-1 block text-xs text-neutral-500";

function formatMoney(amount: string, currency: string) {
  const n = parseFloat(amount);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
}

// Small Gallery/Own badge (2026-09-22) — same visual pattern as
// LocationsCard.tsx's own badge, reused here so a Location's Type reads
// consistently wherever it shows up.
function LocationTypeBadge({ type }: { type: LocationType }) {
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${
        type === "GALLERY" ? "bg-blue-100 text-blue-700" : "bg-neutral-200 text-neutral-600"
      }`}
    >
      {type === "GALLERY" ? "Gallery" : "Own"}
    </span>
  );
}

export default function GalleriesView({
  siteId,
  artistId,
  galleries,
  paymentMethods,
}: {
  siteId: string;
  artistId: string;
  // Every Location this artist has (2026-09-22 rework of the old
  // Galleries-only page) — Gallery (third-party, consignment,
  // commission) and Own (the artist's own stock: studio, storage,
  // framer) alike, keyed by their linked Customer id throughout, same
  // as before this rework. See actions/locations.ts.
  galleries: LocationCustomerSummary[];
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
  const [newLocationType, setNewLocationType] = useState<LocationType>("GALLERY");
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Defaults to "sales" (2026-09-09, direct request) — the sales history
  // is what's checked on opening a gallery day to day; Details (contact
  // info, address) is looked up far less often. openRow below (fired
  // every time a gallery is clicked) resets to this same value too —
  // this initial useState only covers the very first render, before any
  // gallery has been selected at all.
  const [detailTab, setDetailTab] = useState<DetailTab>("sales");
  // Below-xl navigation only (see MobileStep above) — starts on the
  // gallery list, same as the "nothing selected" state.
  const [mobileStep, setMobileStep] = useState<MobileStep>("list");
  const router = useRouter();
  const searchParams = useSearchParams();

  // This Location's Type, looked up from the list prop (2026-09-22) —
  // drives the Own-locations-have-no-commission rule below (Default
  // commission % in Details, Commission % on the Record Sale form both
  // lock to 0 and stop being editable), and which third field/buyer
  // defaults the Record Sale form shows (see openWork below).
  const selectedLocationType = galleries.find((g) => g.id === selectedId)?.locationType ?? null;

  // ---- Consigned Works control panel (2026-08-31, Part Two) ----
  // Clicking a consigned artwork fetches its own full detail (same call
  // the Artwork Catalogue itself uses) so this panel can tell whether
  // it already has a sale on it — a blank "Record Sale" form only ever
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
  // Deposit already paid (2026-09-22, Phase 1 sale-recording rework) —
  // the Own-location counterpart to Commission % above: only ever shown
  // (and only ever sent) for an Own location's Record Sale form, where
  // it stands in for a gallery's commission as the thing that reduces
  // Net Due. See netOwed(), lib/saleMath.ts.
  const [saleDepositPaid, setSaleDepositPaid] = useState("");
  // Buyer name/email (2026-09-22) — for a Gallery location this defaults
  // to the gallery's own contact (still fully overridable, e.g. if the
  // gallery is willing to name the actual end buyer); for an Own
  // location it starts blank, since there's no gallery standing in for
  // the real buyer here. See openWork below and the matching note on
  // startGallerySale in payments.ts.
  const [saleBuyerName, setSaleBuyerName] = useState("");
  const [saleBuyerEmail, setSaleBuyerEmail] = useState("");
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));

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
    // Below xl, picking a gallery moves on to the Consigned Works step
    // next (Works -> Details/Sales is its own explicit step from
    // there — see the "Details & Sales" button below).
    setMobileStep("works");
    setLoading(true);
    getGalleryDetail(customerId).then((detail) => {
      setSelectedDetail(detail);
      setLoading(false);
    });
  };

  // Returns to the gallery list (below xl only — ignored at xl and
  // above, where the list column is always visible regardless).
  const backToList = () => {
    setSelectedId(null);
    setSelectedDetail(null);
    setSelectedWorkId(null);
    setSelectedWorkDetail(null);
    setMobileStep("list");
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
    // everywhere else this default is used. Always 0 for an Own
    // location (2026-09-22) — see selectedLocationType above.
    setSaleCommission(selectedLocationType === "OWN" ? "0" : selectedDetail?.defaultCommissionPercent || "");
    setSaleDepositPaid("");
    // Buyer defaults (2026-09-22, Phase 1 — see the matching note on
    // saleBuyerName/saleBuyerEmail above): a Gallery location prefills
    // its own contact, still overridable; an Own location starts blank
    // so the artist types the real buyer.
    setSaleBuyerName(selectedLocationType === "GALLERY" ? selectedDetail?.name || "" : "");
    setSaleBuyerEmail(selectedLocationType === "GALLERY" ? selectedDetail?.email || "" : "");
    setSaleDate(new Date().toISOString().slice(0, 10));
    getArtworkDetailForClient(workId).then((detail) => {
      setSelectedWorkDetail(detail);
      // Sale price defaults to the artwork's own listed price
      // (2026-09-03) — still fully editable before "Record Sale" is
      // pressed, this just saves retyping a figure that's almost always
      // the same as what's already on the Catalogue. Only meaningful for
      // the blank "Record Sale" form (no active/completed purchase);
      // harmless to set unconditionally since saleTotalAmount is never
      // read once a sale already exists.
      setSaleTotalAmount(detail?.presentationPrice || "");
      setWorkLoading(false);
    });
  };

  const closeWork = () => {
    setSelectedWorkId(null);
    setSelectedWorkDetail(null);
  };

  // Auto-opens a Location (and, if given, one of its works) from the
  // URL's own ?location=&work= query params (2026-09-22) — this is what
  // the Artwork Catalogue's "Sold" button navigates to, so pressing it
  // lands here with the right gallery/work already open, matching the
  // mockup, rather than just dropping onto a blank Locations page.
  // Runs once, on mount, straight from the URL Next.js already parsed
  // for this page — not re-run on every render.
  useEffect(() => {
    const locationParam = searchParams.get("location");
    const workParam = searchParams.get("work");
    if (!locationParam) return;
    setSelectedId(locationParam);
    setSelectedDetail(null);
    setDetailTab("sales");
    setMobileStep("works");
    setLoading(true);
    getGalleryDetail(locationParam).then((detail) => {
      setSelectedDetail(detail);
      setLoading(false);
      if (workParam) openWork(workParam);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // A rename has to cascade to Location.name and every matching
    // Artwork.location string too (2026-09-22) — plain updateCustomer
    // can't do that, so it goes through renameLocationByCustomer
    // instead; every other field below is still a normal Customer field
    // update.
    if (field === "name") {
      startTransition(async () => {
        const result = await renameLocationByCustomer(selectedDetail.id, siteId, value);
        if ("error" in result) {
          setAddError(result.error);
          return;
        }
        router.refresh();
        openRow(selectedDetail.id);
        setSavedField(field);
        setTimeout(() => setSavedField(null), 1500);
      });
      return;
    }

    const fd = new FormData();
    fd.set("kind", selectedDetail.kind);
    fd.set("name", selectedDetail.name);
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
      setSelectedDetail((prev) => (prev ? { ...prev, [field]: value || null } : prev));
      setSavedField(field);
      setTimeout(() => setSavedField(null), 1500);
    });
  };

  // "+ Add Location" (2026-09-22, replaces "+ Add Gallery") — goes
  // through createLocation now (actions/locations.ts), which creates
  // the linked Customer record in the same call, rather than calling
  // createCustomer directly; openRow still just needs the returned
  // customerId, same as before.
  const handleAddLocation = async (formData: FormData) => {
    setAddError(null);
    const name = (formData.get("name") as string)?.trim();
    if (!name) return;
    const result = await createLocation(artistId, siteId, name, newLocationType);
    if ("error" in result) {
      setAddError(result.error);
      return;
    }
    setAdding(false);
    router.refresh();
    openRow(result.customerId);
  };

  const handleDeleteGallery = () => {
    if (!selectedDetail) return;
    setDeleting(true);
    startTransition(async () => {
      // Deletes the Location row first, then its Customer (2026-09-22)
      // — deleteCustomer directly would now fail: Location.customerId
      // has no cascade, so an orphaned Location row would be left
      // pointing at a deleted Customer. See actions/locations.ts.
      await deleteLocationByCustomer(selectedDetail.id, siteId);
      setDeleting(false);
      setConfirmingDelete(false);
      backToList();
      router.refresh();
    });
  };

  // ---- Recording a sale for a consigned work ----
  // Once a sale exists (active or completed), managing it entirely goes
  // through GallerySaleCard below — this is only ever reached from the
  // blank "Record Sale" form, before any Purchase exists yet.
  const handleRecordSale = () => {
    if (!selectedWorkId || !selectedId) return;
    if (!saleTotalAmount.trim()) {
      setSaleError("The sale price is required.");
      return;
    }
    setSaleError(null);
    const fd = new FormData();
    fd.set("totalAmount", saleTotalAmount.trim());
    fd.set("currency", saleCurrency);
    // Always 0 for an Own location (2026-09-22), regardless of whatever
    // is in saleCommission's own state — belt and braces alongside the
    // disabled input below.
    fd.set("commissionPercent", selectedLocationType === "OWN" ? "0" : saleCommission.trim());
    // Deposit paid is only ever meaningful for an Own location — sent
    // regardless (it's simply blank for a Gallery location's form,
    // since that field isn't shown there at all).
    fd.set("depositPaid", selectedLocationType === "OWN" ? saleDepositPaid.trim() : "");
    fd.set("buyerName", saleBuyerName.trim());
    fd.set("buyerEmail", saleBuyerEmail.trim());
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

  // Live Net Due preview on the blank Record Sale form (2026-09-22) —
  // same shared formula used everywhere else a sale's Net Due is shown
  // (GallerySaleCard, payments.ts). saleCommission and saleDepositPaid
  // are never both meaningful at once (the form only shows whichever
  // one applies to this Location's type — see the third-field switch
  // below), so passing both here unconditionally is safe: the one not
  // shown just stays at its default "0"/"" and contributes nothing.
  const saleAmountNum = parseFloat(saleTotalAmount) || 0;
  const saleNetOwed = netOwed(saleTotalAmount, saleCommission, saleDepositPaid);

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

  // Which consigned works have a sale on record (2026-09-03; widened
  // 2026-09-22) — drawn straight from selectedDetail.purchases (which
  // already has artworkId per row) rather than a separate query, so the
  // "SOLD" ribbon below stays in sync with the Sales tab table for
  // free. Now includes ACTIVE (not just COMPLETED) gallery-channel
  // purchases: recording a Consigned Works sale marks the artwork SOLD
  // immediately (see the file-level Availability note in payments.ts),
  // so "has a recorded sale" — not "has been paid" — is what this
  // ribbon should reflect from here on. status !== "ABANDONED" rather
  // than an explicit ACTIVE/COMPLETED list, so a future third non-final
  // status doesn't quietly fall through this filter unnoticed.
  const soldWorkIds = new Set(
    (selectedDetail?.purchases ?? [])
      .filter((p) => p.channel === "GALLERY" && p.status !== "ABANDONED")
      .map((p) => p.artworkId)
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* ---- Consigned Works (left) ---- */}
      {/* Grid only now (2026-09-10) — the per-work detail/action panel
          moved into its own modal below, so the grid no longer has to
          give up a w-80 slice of its own width whenever a work is
          selected; it's always full width.

          Below xl (2026-09-13) — one of three drill-down steps instead
          of a permanent column; see MobileStep above. Always visible
          at xl and above, same as before. */}
      <div
        className={`w-full flex-col overflow-hidden p-6 xl:flex xl:w-auto xl:flex-1 ${
          mobileStep === "works" ? "flex" : "hidden"
        }`}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={backToList}
              className="shrink-0 rounded-md border border-neutral-300 px-2 py-[4px] text-xs hover:bg-neutral-50 xl:hidden"
            >
              ← Locations
            </button>
            <h1 className="text-2xl font-semibold text-neutral-900">Consigned Works</h1>
          </div>
          {selectedDetail && (
            <button
              type="button"
              onClick={() => setMobileStep("details")}
              className="shrink-0 rounded-md bg-neutral-900 px-3 py-[4px] text-xs font-medium text-white hover:bg-neutral-700 xl:hidden"
            >
              Details &amp; Sales →
            </button>
          )}
        </div>
        {!selectedDetail ? (
          <p className="text-sm text-neutral-400">
            Select a location to see the works currently there.
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {selectedDetail.consignedWorks.length === 0 ? (
              <p className="text-sm text-neutral-400">
                Nothing currently has its Location set to this one.
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
                      {/* SOLD ribbon — any recorded (not abandoned)
                          gallery-channel sale, paid or not (2026-09-22
                          — see the note on soldWorkIds above). */}
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
          tab content underneath scrolls.

          Below xl (2026-09-13) — the fixed 600px width made this
          unusable on iPad (widths from 768–1024px), so below xl this is
          full width and only shown as its own drill-down step; see
          MobileStep above. Unchanged at xl and above. */}
      <div
        className={`w-full shrink-0 flex-col overflow-hidden p-6 xl:flex xl:w-[600px] xl:border-l xl:border-neutral-200 ${
          mobileStep === "details" ? "flex" : "hidden"
        }`}
      >
        {!selectedId ? (
          <p className="text-sm text-neutral-400">Select a location to see its details.</p>
        ) : loading || !selectedDetail ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMobileStep("works")}
                  className="shrink-0 rounded-md border border-neutral-300 px-2 py-[2px] text-xs hover:bg-neutral-50 xl:hidden"
                >
                  ← Works
                </button>
                <h2 className="text-lg font-semibold text-neutral-900">{selectedDetail.name}</h2>
                {selectedLocationType && <LocationTypeBadge type={selectedLocationType} />}
              </div>
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
                <button type="button" onClick={backToList} className="rounded-md border border-neutral-300 px-2 py-[2px] text-xs hover:bg-neutral-50">
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
                              {formatDate(p.createdAt)}
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
                  <label className={labelCls}>{selectedLocationType === "OWN" ? "Location name" : "Gallery name"}</label>
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
                    // Always 0 and non-editable for an Own location
                    // (2026-09-22) — you don't pay yourself commission.
                    value={selectedLocationType === "OWN" ? "0" : undefined}
                    defaultValue={selectedLocationType === "OWN" ? undefined : selectedDetail.defaultCommissionPercent || ""}
                    onBlur={(e) => saveField("defaultCommissionPercent", e.target.value.trim())}
                    disabled={isPending || selectedLocationType === "OWN"}
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

      {/* ---- Location list (right) ---- */}
      {/* overflow-hidden, not overflow-y-auto — headers never scroll
          (2026-09-09). The "+ Add Location"/search block below is
          fixed; only the list itself (its own flex-1 overflow-y-auto
          further down) scrolls.

          Below xl (2026-09-13) — full width and only shown as its own
          drill-down step (the starting one); see MobileStep above.
          Unchanged at xl and above.

          Lists BOTH Gallery and Own locations now (2026-09-22 rework)
          — previously Gallery-only ("Galleries" page); a Gallery/Own
          badge next to each name (see LocationTypeBadge above) tells
          them apart. */}
      <div
        className={`h-full w-full shrink-0 flex-col overflow-hidden xl:flex xl:w-[300px] xl:border-l xl:border-neutral-200 ${
          mobileStep === "list" ? "flex" : "hidden"
        }`}
      >
        <div className="border-b border-neutral-200 p-4">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mb-3 w-full rounded-md bg-neutral-900 px-3 py-[4px] text-sm font-medium text-white hover:bg-neutral-700"
          >
            + Add Location
          </button>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
          />
          <p className="mt-2 text-[11px] text-neutral-400">
            {galleries.length} location{galleries.length === 1 ? "" : "s"}
          </p>
        </div>

        {adding && (
          <form
            action={handleAddLocation}
            className="space-y-2 border-b border-neutral-200 bg-neutral-50 p-3"
          >
            <input
              type="text"
              name="name"
              placeholder="Location name"
              required
              autoFocus
              className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs"
            />
            <select
              value={newLocationType}
              onChange={(e) => setNewLocationType(e.target.value as LocationType)}
              className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs"
            >
              <option value="GALLERY">Gallery (third-party)</option>
              <option value="OWN">Own (e.g. your studio)</option>
            </select>
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
                    <LocationTypeBadge type={g.locationType} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ---- Artwork sale modal ---- */}
      {/* Fixed overlay on top of everything, at every width. Shared
          SaleHeader on top; below it either the sale card (sale already
          recorded) or the blank Record Sale form. */}
      {selectedWorkId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            {workLoading || !selectedWorkDetail ? (
              <p className="p-6 text-sm text-neutral-400">Loading…</p>
            ) : (
              <>
                <div className="shrink-0">
                  <SaleHeader
                    artwork={selectedWorkDetail}
                    purchase={activeWorkPurchase ?? completedGallerySale}
                    siteId={siteId}
                    onChanged={refreshAfterSaleChange}
                    onClose={closeWork}
                  />
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-5">
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
                    <div className="space-y-3">
                      {/* Row 1: Date · Sale price · Currency */}
                      <div className="grid grid-cols-[1fr_1fr_6rem] gap-3">
                        <div>
                          <label className={labelCls}>Date</label>
                          <input
                            type="date"
                            value={saleDate}
                            onChange={(e) => setSaleDate(e.target.value)}
                            className={inputCls}
                          />
                        </div>
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
                      </div>

                      {/* Row 2: Commission % (Gallery) or Deposit paid
                          (Own) · Net Due. Both feed netOwed(). */}
                      <div className="grid grid-cols-2 gap-3">
                        {selectedLocationType === "OWN" ? (
                          <div>
                            <label className={labelCls}>Deposit paid</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={saleDepositPaid}
                              onChange={(e) => setSaleDepositPaid(e.target.value)}
                              placeholder="e.g. 50.00"
                              className={inputCls}
                            />
                          </div>
                        ) : (
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
                        )}
                        <div>
                          <label className={labelCls}>Net Due</label>
                          <input
                            type="text"
                            readOnly
                            value={saleAmountNum ? formatMoney(saleNetOwed.toFixed(2), saleCurrency) : "—"}
                            className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm text-neutral-500"
                          />
                        </div>
                      </div>

                      {/* Row 3: Customer · Customer email (wider) */}
                      <div className="grid grid-cols-[2fr_3fr] gap-3">
                        <div>
                          <label className={labelCls}>Customer</label>
                          <input
                            type="text"
                            value={saleBuyerName}
                            onChange={(e) => setSaleBuyerName(e.target.value)}
                            placeholder={
                              selectedLocationType === "OWN" ? "Buyer's name" : "Defaults to gallery name"
                            }
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Customer email</label>
                          <input
                            type="email"
                            value={saleBuyerEmail}
                            onChange={(e) => setSaleBuyerEmail(e.target.value)}
                            placeholder={
                              selectedLocationType === "OWN" ? "Buyer's email" : "Defaults to gallery email"
                            }
                            className={inputCls}
                          />
                        </div>
                      </div>

                      {saleError && <p className="text-xs text-red-600">{saleError}</p>}

                      <button
                        type="button"
                        onClick={handleRecordSale}
                        disabled={workPending || !saleTotalAmount.trim()}
                        className="mt-3 w-full rounded-md bg-[#5E5E5E] px-3 py-2 text-sm text-[#F9F6EE] hover:bg-[#4a4a4a] disabled:opacity-50"
                      >
                        Record Sale
                      </button>
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
        title={`Delete ${selectedDetail?.name ?? "this location"}?`}
        message={
          selectedDetail && selectedDetail.purchases.length > 0
            ? `This removes the contact record only — their ${selectedDetail.purchases.length} sale${selectedDetail.purchases.length === 1 ? "" : "s"} stay exactly as they are (invoices, amounts, everything), just no longer linked to a customer record. Consigned Works (matched by name, not a real link) are unaffected either way. Can't be undone.`
            : "This removes the location. Can't be undone."
        }
        confirmLabel={deleting ? "Deleting…" : "Delete permanently"}
        danger
        onConfirm={handleDeleteGallery}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
