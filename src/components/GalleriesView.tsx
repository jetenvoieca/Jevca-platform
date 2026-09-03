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
  markGallerySalePaid,
  abandonPurchase,
  deleteGallerySale,
  createGalleryPaymentLink,
  type PurchaseDetail,
} from "@/lib/actions/payments";
import type { ArtworkDetail } from "@/components/ArtworkDetailPanel";
import ConfirmDialog from "@/components/ConfirmDialog";
import InvoiceEmailModal from "@/components/InvoiceEmailModal";

type DetailTab = "details" | "sales";

const inputCls =
  "w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50";
const labelCls = "mb-1 block text-xs text-neutral-500";

// Shared style for the 2x2 sale-action grid (Send invoice / Cancel Sale
// / Mark as paid / Delete Sale) — solid black buttons throughout, no
// separate red "danger" treatment for Cancel/Delete, since each of
// those already opens a ConfirmDialog before anything actually happens
// (2026-09-01 restyle, matches Craig's mockup).
const actionButtonCls =
  "rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50";

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

// Net owed after commission — shared by the active-sale card and the
// completed-sale summary (2026-09-03), so the figure is calculated
// exactly the same way in both places.
function netOwed(totalAmount: string, commissionPercent: string | null) {
  const total = parseFloat(totalAmount);
  const commission = commissionPercent ? parseFloat(commissionPercent) : 0;
  return total - total * (commission / 100);
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
  // Offered in the "Mark as paid" Method dropdown (2026-09-03) —
  // Settings-editable, same list the Payment Methods card on the
  // Artwork Catalogue's Settings screen manages. See artworkSettings.ts.
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
  const [detailTab, setDetailTab] = useState<DetailTab>("details");
  const router = useRouter();

  // ---- Consigned Works control panel (2026-08-31, Part Two) ----
  // Clicking a consigned artwork fetches its own full detail (same call
  // the Artwork Catalogue itself uses) so this panel can tell whether
  // it already has a sale on it — a blank "Start a sale" form only ever
  // shows for an artwork with no active sale; otherwise its live status
  // shows instead. Kept as a separate fetch/loading pair from the
  // gallery's own selectedDetail above, since they're genuinely
  // different records (Customer vs Artwork).
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [selectedWorkDetail, setSelectedWorkDetail] = useState<ArtworkDetail | null>(null);
  const [workLoading, setWorkLoading] = useState(false);
  const [workPending, startWorkTransition] = useTransition();
  const [saleError, setSaleError] = useState<string | null>(null);
  const [saleTotalAmount, setSaleTotalAmount] = useState("");
  const [saleCurrency, setSaleCurrency] = useState("GBP");
  const [saleCommission, setSaleCommission] = useState("");
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pendingWorkConfirm, setPendingWorkConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  // ---- Invoice email + Stripe payment link (2026-09-01, Part Three) ----
  // A separate, small piece of state rather than folding into
  // pendingWorkConfirm above — this isn't a confirm/cancel dialog, it's
  // its own multi-tab flow (InvoiceEmailModal), and "payment link"
  // copy-feedback is its own tiny thing that doesn't belong on either.
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  // Which purchase the modal is for (2026-09-03) — no longer always
  // "whichever purchase is active", since Send invoice can now also be
  // pressed from the completed-sale summary below, where there is no
  // active purchase at all.
  const [invoicePurchaseId, setInvoicePurchaseId] = useState<string | null>(null);
  // Whether that purchase is already paid (2026-09-03) — passed straight
  // through to InvoiceEmailModal so it can say "Receipt" instead of
  // "Invoice" when that's what's actually being sent, matching the PDF
  // itself (generateInvoicePdf already titles the document that way).
  const [invoiceIsPaid, setInvoiceIsPaid] = useState(false);
  const [preparingInvoice, setPreparingInvoice] = useState(false);
  const [paymentLinkError, setPaymentLinkError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // ---- Mark as paid — inline Date paid / Method form (2026-09-03) ----
  // Replaces the old plain ConfirmDialog for this one action — Cancel
  // Sale and Delete Sale still use pendingWorkConfirm above, since they
  // genuinely only need a yes/no; this one needs to actually collect two
  // values first, so it gets its own small inline form instead.
  const [showMarkPaidForm, setShowMarkPaidForm] = useState(false);
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidMethod, setPaidMethod] = useState("");

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
    setDetailTab("details");
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
    setPaymentLinkError(null);
    setShowMarkPaidForm(false);
    setShowInvoiceModal(false);
    setSaleTotalAmount("");
    setSaleCurrency("GBP");
    // Defaults to this gallery's own default commission — still
    // editable per sale, same "starting point, not binding" idea as
    // everywhere else this default is used.
    setSaleCommission(selectedDetail?.defaultCommissionPercent || "");
    setSaleDate(new Date().toISOString().slice(0, 10));
    getArtworkDetailForClient(workId).then((detail) => {
      setSelectedWorkDetail(detail);
      setWorkLoading(false);
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

  // ---- Starting/managing a gallery sale for a consigned work ----

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

  // Opens the inline Date paid / Method form rather than marking paid
  // immediately (2026-09-03) — see the showMarkPaidForm state above.
  const handleMarkPaidClick = () => {
    setSaleError(null);
    setPaidDate(new Date().toISOString().slice(0, 10));
    setPaidMethod(paymentMethods[0] || "");
    setShowMarkPaidForm(true);
  };

  const handleConfirmMarkPaid = () => {
    if (!selectedWorkDetail?.activePurchase || !selectedWorkId || !selectedId) return;
    const purchaseId = selectedWorkDetail.activePurchase.id;
    setSaleError(null);
    const fd = new FormData();
    fd.set("paidDate", paidDate);
    fd.set("method", paidMethod);
    startWorkTransition(async () => {
      const res = await markGallerySalePaid(purchaseId, siteId, fd);
      if (!res.ok) {
        setSaleError(res.error);
        return;
      }
      setShowMarkPaidForm(false);
      const detail = await getArtworkDetailForClient(selectedWorkId);
      setSelectedWorkDetail(detail);
      refreshGalleryDetail(selectedId);
      router.refresh();
    });
  };

  const handleCancelWorkSale = () => {
    if (!selectedWorkDetail?.activePurchase || !selectedWorkId || !selectedId) return;
    const purchaseId = selectedWorkDetail.activePurchase.id;
    setPendingWorkConfirm({
      title: "Cancel this sale?",
      message: "It'll be kept in the history, marked as abandoned.",
      confirmLabel: "Cancel sale",
      danger: true,
      onConfirm: () => {
        setPendingWorkConfirm(null);
        setSaleError(null);
        startWorkTransition(async () => {
          const res = await abandonPurchase(purchaseId, siteId);
          if (!res.ok) setSaleError(res.error);
          const detail = await getArtworkDetailForClient(selectedWorkId);
          setSelectedWorkDetail(detail);
          refreshGalleryDetail(selectedId);
          router.refresh();
        });
      },
    });
  };

  const handleDeleteWorkSale = () => {
    if (!selectedWorkDetail?.activePurchase || !selectedWorkId || !selectedId) return;
    const purchaseId = selectedWorkDetail.activePurchase.id;
    const invoiceNumber = selectedWorkDetail.activePurchase.invoiceNumber;
    const message = invoiceNumber
      ? `An invoice (#${invoiceNumber}) was already generated for it — deleting will leave a gap in your invoice numbering, which is fine but can't be undone. This removes the sale entirely.`
      : "This removes the sale entirely — it cannot be undone.";
    setPendingWorkConfirm({
      title: "Delete this sale permanently?",
      message,
      confirmLabel: "Delete permanently",
      danger: true,
      onConfirm: () => {
        setPendingWorkConfirm(null);
        setSaleError(null);
        startWorkTransition(async () => {
          const res = await deleteGallerySale(purchaseId, siteId);
          if (!res.ok) {
            setSaleError(res.error);
            return;
          }
          const detail = await getArtworkDetailForClient(selectedWorkId);
          setSelectedWorkDetail(detail);
          refreshGalleryDetail(selectedId);
          router.refresh();
        });
      },
    });
  };

  // ---- Invoice email + Payment link actions (2026-09-01, Part Three) ----

  // Refetches this work's detail (to pick up invoiceEmailedAt/To once
  // sent, or a freshly-generated payment link) and the gallery's own
  // detail (its Sales tab reads from the same Purchase rows) — same
  // refresh pair used by every other sale action above, so the two
  // panels never fall out of sync with each other.
  const refreshAfterInvoiceOrLinkChange = () => {
    if (!selectedWorkId || !selectedId) return;
    getArtworkDetailForClient(selectedWorkId).then((detail) => setSelectedWorkDetail(detail));
    refreshGalleryDetail(selectedId);
  };

  // Send invoice now auto-generates the payment link first if this sale
  // is still ACTIVE and doesn't already have one, so the emailed invoice
  // always includes a way to pay without a separate manual step
  // (2026-09-01). Takes the purchase explicitly (2026-09-03) rather than
  // always reading activePurchase, since this is now also reachable from
  // the completed-sale summary below, where there is no active purchase
  // at all — a completed sale is already paid, so it never needs a
  // payment link generated first. If link generation fails, the modal
  // still opens rather than blocking the invoice — the email falls back
  // to its non-link wording, and a link can always be generated
  // afterwards from the Payment link section.
  const handleOpenInvoiceModal = (purchase: PurchaseDetail) => {
    setInvoicePurchaseId(purchase.id);
    setInvoiceIsPaid(purchase.status === "COMPLETED");
    if (purchase.status !== "ACTIVE" || purchase.stripePaymentLinkUrl) {
      setShowInvoiceModal(true);
      return;
    }
    setPaymentLinkError(null);
    setPreparingInvoice(true);
    startWorkTransition(async () => {
      const res = await createGalleryPaymentLink(purchase.id, siteId);
      if (!res.ok) setPaymentLinkError(res.error);
      refreshAfterInvoiceOrLinkChange();
      setPreparingInvoice(false);
      setShowInvoiceModal(true);
    });
  };

  const handleGetPaymentLink = () => {
    if (!selectedWorkDetail?.activePurchase || !selectedWorkId) return;
    const purchaseId = selectedWorkDetail.activePurchase.id;
    setPaymentLinkError(null);
    startWorkTransition(async () => {
      // createGalleryPaymentLink itself is idempotent — if this sale
      // already has a link, it just returns the existing one rather than
      // creating a duplicate, so this is safe to call every time the
      // button is pressed.
      const res = await createGalleryPaymentLink(purchaseId, siteId);
      if (!res.ok) {
        setPaymentLinkError(res.error);
        return;
      }
      refreshAfterInvoiceOrLinkChange();
    });
  };

  const handleCopyPaymentLink = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    });
  };

  const activeWorkPurchase = selectedWorkDetail?.activePurchase ?? null;
  // A sale that's already been marked paid, for the artwork currently
  // open — only looked up when there's no active purchase, since active
  // always takes priority (2026-09-03). purchaseHistory is already
  // ordered most-recent-first (same query ordering as activePurchase
  // itself), so this is genuinely the latest completed gallery sale, not
  // just any past one — relevant for a piece that's been consigned, sold,
  // returned, and consigned again.
  const completedGallerySale: PurchaseDetail | null = !activeWorkPurchase
    ? (selectedWorkDetail?.purchaseHistory.find(
        (p) => p.channel === "GALLERY" && p.status === "COMPLETED"
      ) ?? null)
    : null;
  const completedPayment = completedGallerySale?.payments[0] ?? null;

  const saleAmountNum = parseFloat(saleTotalAmount) || 0;
  const saleCommissionNum = parseFloat(saleCommission) || 0;
  const saleNetOwed = saleAmountNum - saleAmountNum * (saleCommissionNum / 100);

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
                            <img
                              src={w.imageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                          {/* SOLD ribbon (2026-09-03) — only for a
                              completed gallery sale, not just an active
                              (UNPAID) one, matching Craig's mockup. */}
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

              {selectedWorkId && (
                <div className="w-80 shrink-0 rounded-lg border border-neutral-200 p-4">
                  {workLoading || !selectedWorkDetail ? (
                    <p className="text-sm text-neutral-400">Loading…</p>
                  ) : (
                    <>
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-neutral-900">
                          {selectedWorkDetail.presentationTitle}
                        </p>
                        {(selectedWorkDetail.type || selectedWorkDetail.edition) && (
                          <p className="shrink-0 text-xs text-neutral-400">
                            {selectedWorkDetail.type}
                            {selectedWorkDetail.type && selectedWorkDetail.edition ? " - " : ""}
                            {selectedWorkDetail.edition}
                          </p>
                        )}
                      </div>
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
                          <div>
                            <p className="mb-2 text-sm font-medium text-neutral-900">
                              {formatMoney(activeWorkPurchase.totalAmount, activeWorkPurchase.currency)}
                            </p>
                            <SaleStatusBadge status={activeWorkPurchase.status} />
                            {activeWorkPurchase.commissionPercent && (
                              <p className="mt-2 text-xs text-neutral-500">
                                Commission {activeWorkPurchase.commissionPercent}% — net owed{" "}
                                {formatMoney(
                                  netOwed(
                                    activeWorkPurchase.totalAmount,
                                    activeWorkPurchase.commissionPercent
                                  ).toFixed(2),
                                  activeWorkPurchase.currency
                                )}
                              </p>
                            )}
                            <p className="mt-2 text-xs text-neutral-400">
                              Sold {new Date(activeWorkPurchase.createdAt).toLocaleDateString()}
                            </p>
                            {/* Part Three (2026-09-01) — a simple sent-log,
                                not a full send history: shows the most
                                recent send only. Matches Purchase's
                                invoiceEmailedAt/invoiceEmailedTo columns,
                                which are overwritten on each send rather
                                than accumulating a list. */}
                            {activeWorkPurchase.invoiceEmailedAt && (
                              <p className="mt-1 text-xs text-green-600">
                                Invoice sent{" "}
                                {new Date(activeWorkPurchase.invoiceEmailedAt).toLocaleDateString()}
                                {activeWorkPurchase.invoiceEmailedTo
                                  ? ` to ${activeWorkPurchase.invoiceEmailedTo}`
                                  : ""}
                              </p>
                            )}
                            {saleError && <p className="mt-2 text-xs text-red-600">{saleError}</p>}

                            {/* 2x2 action grid (2026-09-01 restyle) — all
                                four sale actions as equal-weight solid
                                buttons, matching Craig's mockup. Cancel
                                Sale and Delete Sale keep their existing
                                ConfirmDialog safety step even though the
                                red "danger" styling that used to flag them
                                visually is gone. */}
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenInvoiceModal(activeWorkPurchase)}
                                disabled={workPending}
                                className={actionButtonCls}
                              >
                                {preparingInvoice
                                  ? "Preparing…"
                                  : activeWorkPurchase.invoiceEmailedAt
                                    ? "Send invoice again"
                                    : "Send invoice"}
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelWorkSale}
                                disabled={workPending}
                                className={actionButtonCls}
                              >
                                Cancel Sale
                              </button>
                              <button
                                type="button"
                                onClick={handleMarkPaidClick}
                                disabled={workPending}
                                className={actionButtonCls}
                              >
                                Mark as paid
                              </button>
                              <button
                                type="button"
                                onClick={handleDeleteWorkSale}
                                disabled={workPending}
                                className={actionButtonCls}
                              >
                                Delete Sale
                              </button>
                            </div>

                            {/* Inline Date paid / Method form (2026-09-03)
                                — replaces the old plain confirm dialog for
                                this one action, so the actual payment
                                details get captured at the same moment. */}
                            {showMarkPaidForm && (
                              <div className="mt-3 space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
                                <div>
                                  <label className={labelCls}>Date paid</label>
                                  <input
                                    type="date"
                                    value={paidDate}
                                    onChange={(e) => setPaidDate(e.target.value)}
                                    className={inputCls}
                                  />
                                </div>
                                <div>
                                  <label className={labelCls}>Method</label>
                                  <select
                                    value={paidMethod}
                                    onChange={(e) => setPaidMethod(e.target.value)}
                                    className={inputCls}
                                  >
                                    <option value="">Choose…</option>
                                    {paymentMethods.map((m) => (
                                      <option key={m} value={m}>
                                        {m}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={handleConfirmMarkPaid}
                                    disabled={workPending || !paidMethod}
                                    className="flex-1 rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-white hover:bg-neutral-700 disabled:opacity-50"
                                  >
                                    Paid
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setShowMarkPaidForm(false)}
                                    disabled={workPending}
                                    className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-white disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Payment link — persistent, net-owed link,
                                separate from the full-price links used
                                for direct Stripe sales elsewhere. Now
                                generated automatically the first time
                                "Send invoice" is used, but still shown
                                and copyable here, and still generatable
                                on its own ahead of sending an invoice. */}
                            <div className="mt-3 border-t border-neutral-100 pt-3">
                              {activeWorkPurchase.stripePaymentLinkUrl ? (
                                <div>
                                  <label className={labelCls}>Payment link</label>
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      readOnly
                                      value={activeWorkPurchase.stripePaymentLinkUrl}
                                      onFocus={(e) => e.currentTarget.select()}
                                      className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-600"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCopyPaymentLink(activeWorkPurchase.stripePaymentLinkUrl!)
                                      }
                                      className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                                    >
                                      {linkCopied ? "Copied" : "Copy"}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={handleGetPaymentLink}
                                  disabled={workPending}
                                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
                                >
                                  {workPending ? "Generating…" : "Get payment link"}
                                </button>
                              )}
                              {paymentLinkError && (
                                <p className="mt-2 text-xs text-red-600">{paymentLinkError}</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-neutral-500">
                            This artwork already has an active Stripe sale in progress — manage
                            it from the Artwork Catalogue&apos;s Payment tab.
                          </p>
                        )
                      ) : completedGallerySale ? (
                        // A gallery sale already marked paid, for a work
                        // with no active sale on it right now (2026-09-03
                        // fix) — previously this fell straight through to
                        // the blank "Start a sale" form below, which was
                        // wrong: getArtworkDetailForClient's activePurchase
                        // only ever holds ACTIVE sales, so a just-completed
                        // one has nowhere else to show once marked paid.
                        <div>
                          <p className="mb-2 text-sm font-medium text-neutral-900">
                            {formatMoney(completedGallerySale.totalAmount, completedGallerySale.currency)}
                          </p>
                          <SaleStatusBadge status="COMPLETED" />
                          {completedGallerySale.commissionPercent && (
                            <p className="mt-2 text-xs text-neutral-500">
                              Commission {completedGallerySale.commissionPercent}% — net owed{" "}
                              {formatMoney(
                                netOwed(
                                  completedGallerySale.totalAmount,
                                  completedGallerySale.commissionPercent
                                ).toFixed(2),
                                completedGallerySale.currency
                              )}
                            </p>
                          )}
                          <p className="mt-2 text-xs text-neutral-400">
                            Sold {new Date(completedGallerySale.createdAt).toLocaleDateString()}
                          </p>
                          {completedPayment?.paidDate && (
                            <p className="mt-1 text-xs text-green-600">
                              Paid {new Date(completedPayment.paidDate).toLocaleDateString()}
                              {completedPayment.method ? ` — ${completedPayment.method}` : ""}
                            </p>
                          )}
                          {completedGallerySale.invoiceEmailedAt && (
                            <p className="mt-1 text-xs text-neutral-400">
                              Receipt sent{" "}
                              {new Date(completedGallerySale.invoiceEmailedAt).toLocaleDateString()}
                              {completedGallerySale.invoiceEmailedTo
                                ? ` to ${completedGallerySale.invoiceEmailedTo}`
                                : ""}
                            </p>
                          )}
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => handleOpenInvoiceModal(completedGallerySale)}
                              disabled={workPending}
                              className={actionButtonCls}
                            >
                              {completedGallerySale.invoiceEmailedAt
                                ? "Send receipt again"
                                : "Send receipt"}
                            </button>
                          </div>
                        </div>
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
                              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                            >
                              Start sale
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedWorkId(null);
                              setSelectedWorkDetail(null);
                            }}
                            className="mt-3 text-sm text-red-600 hover:underline"
                          >
                            Cancel sale
                          </button>
                        </div>
                      )}
                    </>
                  )}
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
                          // Clicking a row opens that artwork in the
                          // Consigned Works panel on the left (2026-09-03)
                          // — same as clicking its thumbnail there, just
                          // reachable from this table too.
                          <tr
                            key={p.id}
                            onClick={() => openWork(p.artworkId)}
                            className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                          >
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

      <ConfirmDialog
        open={pendingWorkConfirm !== null}
        title={pendingWorkConfirm?.title ?? ""}
        message={pendingWorkConfirm?.message ?? ""}
        confirmLabel={pendingWorkConfirm?.confirmLabel ?? ""}
        danger={pendingWorkConfirm?.danger}
        onConfirm={() => pendingWorkConfirm?.onConfirm()}
        onCancel={() => setPendingWorkConfirm(null)}
      />

      {showInvoiceModal && invoicePurchaseId && (
        <InvoiceEmailModal
          purchaseId={invoicePurchaseId}
          siteId={siteId}
          isPaid={invoiceIsPaid}
          onClose={() => setShowInvoiceModal(false)}
          onSent={refreshAfterInvoiceOrLinkChange}
        />
      )}
    </div>
  );
}
