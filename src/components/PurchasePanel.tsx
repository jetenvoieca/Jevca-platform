"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  startPurchase,
  startGallerySale,
  recordPastSale,
  deleteGallerySale,
  forceDeleteCompletedSale,
  markGallerySalePaid,
  updatePurchaseRelease,
  abandonPurchase,
  createPaymentLink,
  createCardEntryIntent,
  type SaleTermsDetail,
  type PurchaseDetail,
} from "@/lib/actions/payments";
import StripeCardForm from "@/components/StripeCardForm";
import ConfirmDialog from "@/components/ConfirmDialog";
import CustomerPicker from "@/components/CustomerPicker";
import type { CustomerSummary } from "@/lib/actions/customers";

// Same list as the Presentation tab's Currency field (Sale Terms merged
// into it 2026-08-15) — kept in sync deliberately, since these two forms
// need to offer identical currency choices.
const CURRENCIES = ["GBP", "EUR"];

function formatMoney(amount: string, currency: string) {
  const n = parseFloat(amount);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
}

// Opens the generated PDF in a new tab/download — a plain onClick +
// window.open rather than a raw <a href> or next/link's <Link> (which is
// for in-app navigation, not hitting an API route that returns a file).
function downloadInvoice(purchaseId: string) {
  window.open(`/api/invoice/${purchaseId}`, "_blank");
}

export default function PurchasePanel({
  artworkId,
  artistId,
  siteId,
  terms,
  priceFramed,
  showFramedPricing,
  activePurchase,
  history,
  saleSources = [],
  onChanged,
}: {
  artworkId: string;
  artistId: string;
  siteId: string;
  terms: SaleTermsDetail | null;
  // Both new (2026-08-15), feeding the "which price/plan" option
  // selector below — Framed price lives only on the Artwork, never on
  // Sale Terms (only Unframed's total is kept in sync there), and
  // showFramedPricing is the same Edition-or-"Original - Paper" check
  // already computed once in ArtworkDetailPanel, passed down rather
  // than re-derived here from Type.
  priceFramed: string | null;
  showFramedPricing: boolean;
  activePurchase: PurchaseDetail | null;
  history: PurchaseDetail[];
  saleSources?: string[];
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [cardSecret, setCardSecret] = useState<string | null>(null);
  const [cardPublishableKey, setCardPublishableKey] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<
    "unframed-full" | "unframed-instalments" | "framed-full" | "framed-instalments"
  >("unframed-full");
  const [channel, setChannel] = useState<"STRIPE" | "GALLERY" | "PAST">("STRIPE");
  const [commissionPercent, setCommissionPercent] = useState("");
  const [gallerySalePrice, setGallerySalePrice] = useState("");
  // Controlled rather than plain defaultValue inputs, so picking an
  // existing customer from the search box can actually fill them in
  // (2026-08-13). Two separate sets since Stripe and Gallery are two
  // separate forms/tabs, not shared state.
  const [stripeBuyerName, setStripeBuyerName] = useState("");
  const [stripeBuyerEmail, setStripeBuyerEmail] = useState("");
  const [galleryBuyerName, setGalleryBuyerName] = useState("");
  const [galleryBuyerEmail, setGalleryBuyerEmail] = useState("");
  const [galleryBuyerAddress, setGalleryBuyerAddress] = useState("");
  // A third, separate set again (2026-08-14) — Past Sale is its own tab
  // with its own price/commission/date, not a variant of the Gallery form
  // even though the fields look similar.
  const [pastBuyerName, setPastBuyerName] = useState("");
  const [pastBuyerEmail, setPastBuyerEmail] = useState("");
  const [pastBuyerAddress, setPastBuyerAddress] = useState("");
  const [pastSalePrice, setPastSalePrice] = useState("");
  const [pastCommissionPercent, setPastCommissionPercent] = useState("");
  const [pastSaleCurrency, setPastSaleCurrency] = useState(terms?.currency ?? "GBP");
  // Bug fixed 2026-08-13: this form had no currency field at all, so
  // every gallery sale was silently recorded in GBP regardless of what
  // currency Sale Terms actually specified — confirmed from a real sale
  // (Sale Terms in EUR, but the resulting Purchase and invoice both came
  // out in GBP). Defaults to the artwork's own Sale Terms currency, now
  // set from the Presentation tab (merged 2026-08-15).
  const [gallerySaleCurrency, setGallerySaleCurrency] = useState(terms?.currency ?? "GBP");

  // The four possible sale options (2026-08-15) — replaces the old
  // "Payment type" dropdown, which only chose Full vs Instalments and
  // had no way to pick Framed vs Unframed at all. Built once from
  // Sale Terms/Framed price/instalment count rather than typed
  // anywhere, so the amount actually charged always matches what's set
  // on Presentation.
  type SaleOption = {
    key: "unframed-full" | "unframed-instalments" | "framed-full" | "framed-instalments";
    framed: boolean;
    type: "FULL" | "INSTALMENTS";
    label: string;
    amount: string;
    perInstalment?: string;
  };
  const instalmentCount = terms?.instalmentCount ?? 0;
  const saleOptions: SaleOption[] = [];
  if (terms) {
    saleOptions.push({
      key: "unframed-full",
      framed: false,
      type: "FULL",
      label: "Unframed — Full payment",
      amount: terms.totalAmount,
    });
    if (instalmentCount > 1) {
      saleOptions.push({
        key: "unframed-instalments",
        framed: false,
        type: "INSTALMENTS",
        label: `Unframed — ${instalmentCount} instalments`,
        amount: terms.totalAmount,
        perInstalment: (parseFloat(terms.totalAmount) / instalmentCount).toFixed(2),
      });
    }
    if (showFramedPricing && priceFramed) {
      saleOptions.push({
        key: "framed-full",
        framed: true,
        type: "FULL",
        label: "Framed — Full payment",
        amount: priceFramed,
      });
      if (instalmentCount > 1) {
        saleOptions.push({
          key: "framed-instalments",
          framed: true,
          type: "INSTALMENTS",
          label: `Framed — ${instalmentCount} instalments`,
          amount: priceFramed,
          perInstalment: (parseFloat(priceFramed) / instalmentCount).toFixed(2),
        });
      }
    }
  }
  const activeOption =
    saleOptions.find((o) => o.key === selectedOption) ?? saleOptions[0] ?? null;
  // Drives ConfirmDialog for every sale-related confirmation on this
  // panel (2026-08-13, replacing native confirm() — see ConfirmDialog
  // for why).
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const handleSaveRelease = (formData: FormData) => {
    if (!activePurchase) return;
    startTransition(async () => {
      await updatePurchaseRelease(activePurchase.id, siteId, formData);
      setSaved(true);
      if (onChanged) onChanged();
      else router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });
  };

  // Combines starting the sale with immediately getting a payment
  // link/opening card entry, in one click (2026-08-15) — the mockup put
  // these on the same first screen rather than a separate step after
  // "Start sale". Reuses the exact same createPaymentLink/
  // createCardEntryIntent calls (and their linkUrl/cardSecret display)
  // already used for a returning-later "get another link" from the
  // active-sale card below — that fallback stays untouched, this just
  // adds a faster path that also creates the sale.
  const handleStartAndGetLink = (formData: FormData) => {
    setError(null);
    setLinkUrl(null);
    startTransition(async () => {
      const res = await startPurchase(artworkId, siteId, formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const linkResult = await createPaymentLink(res.purchaseId, siteId, artworkId);
      if (linkResult.ok) setLinkUrl(linkResult.url);
      else setError(linkResult.error);
      if (onChanged) onChanged();
      else router.refresh();
    });
  };

  const handleStartAndEnterCard = (formData: FormData) => {
    setError(null);
    setCardSecret(null);
    setCardPublishableKey(null);
    startTransition(async () => {
      const res = await startPurchase(artworkId, siteId, formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const cardResult = await createCardEntryIntent(res.purchaseId, siteId);
      if (cardResult.ok) {
        setCardSecret(cardResult.clientSecret);
        setCardPublishableKey(cardResult.publishableKey);
      } else {
        setError(cardResult.error);
      }
      if (onChanged) onChanged();
      else router.refresh();
    });
  };

  const handleStartGallerySale = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await startGallerySale(artworkId, siteId, formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (onChanged) onChanged();
      else router.refresh();
    });
  };

  const handleRecordPastSale = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await recordPastSale(artworkId, siteId, formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Already complete — no follow-up step needed, unlike a live
      // Gallery sale which still needs marking paid separately.
      setPastBuyerName("");
      setPastBuyerEmail("");
      setPastBuyerAddress("");
      setPastSalePrice("");
      setPastCommissionPercent("");
      if (onChanged) onChanged();
      else router.refresh();
    });
  };

  const handleMarkPaid = () => {
    if (!activePurchase) return;
    setPendingConfirm({
      title: "Mark this sale as paid?",
      message: "Only do this once the gallery has actually paid.",
      confirmLabel: "Mark as paid",
      onConfirm: () => {
        setPendingConfirm(null);
        setError(null);
        startTransition(async () => {
          const res = await markGallerySalePaid(activePurchase.id, siteId);
          if (!res.ok) setError(res.error);
          if (onChanged) onChanged();
          else router.refresh();
        });
      },
    });
  };

  const handleAbandon = () => {
    if (!activePurchase) return;
    setPendingConfirm({
      title: "Cancel this sale?",
      message: "It'll be kept in the history below, marked as abandoned.",
      confirmLabel: "Cancel sale",
      danger: true,
      onConfirm: () => {
        setPendingConfirm(null);
        setError(null);
        startTransition(async () => {
          const res = await abandonPurchase(activePurchase.id, siteId);
          if (!res.ok) setError(res.error);
          if (onChanged) onChanged();
          else router.refresh();
        });
      },
    });
  };

  // For a genuinely wrong gallery sale (not just one that fell through) —
  // deliberately a separate, harder confirmation from "Cancel" above,
  // since this can't be undone. Warns specifically about invoice number
  // gaps, since that's the one consequence that isn't obvious from the
  // UI alone (2026-08-13).
  const handleDeleteHistoryItem = (p: PurchaseDetail) => {
    const message = p.invoiceNumber
      ? `An invoice (#${p.invoiceNumber}) was already generated for it — deleting will leave a gap in your invoice numbering, which is fine but can't be undone. This removes the sale entirely, not just from this list.`
      : "This removes the sale entirely, not just from this list — it cannot be undone.";
    setPendingConfirm({
      title: "Delete this sale permanently?",
      message,
      confirmLabel: "Delete permanently",
      danger: true,
      onConfirm: () => {
        setPendingConfirm(null);
        setError(null);
        startTransition(async () => {
          const res = await deleteGallerySale(p.id, siteId);
          if (!res.ok) setError(res.error);
          if (onChanged) onChanged();
          else router.refresh();
        });
      },
    });
  };

  // Separate, deliberately harder-to-reach path for removing a genuinely
  // completed, paid sale (2026-08-13, at the person's explicit request
  // for cleaning up test data). Never the default option — this is the
  // only place in the app that can do this, and the wording says
  // plainly what it's destroying.
  const handleForceDeleteCompleted = (p: PurchaseDetail) => {
    setPendingConfirm({
      title: "Force delete this completed sale?",
      message:
        "This sale is marked as paid — deleting it removes it as a financial record entirely, permanently, including its invoice/receipt number. Only do this for test or clearly erroneous data, never for a real transaction.",
      confirmLabel: "Force delete",
      danger: true,
      onConfirm: () => {
        setPendingConfirm(null);
        setError(null);
        startTransition(async () => {
          const res = await forceDeleteCompletedSale(p.id, siteId);
          if (!res.ok) setError(res.error);
          if (onChanged) onChanged();
          else router.refresh();
        });
      },
    });
  };

  // Direct delete for a currently-active, unpaid gallery sale — added
  // 2026-08-13 so a genuinely wrong transaction (mistyped commission,
  // wrong buyer) doesn't need the extra "cancel first, then delete from
  // history" round trip. Same restriction either way: only unpaid
  // gallery sales, enforced again server-side regardless.
  const handleDeleteActiveSale = () => {
    if (!activePurchase) return;
    const message = activePurchase.invoiceNumber
      ? `An invoice (#${activePurchase.invoiceNumber}) was already generated for it — deleting will leave a gap in your invoice numbering, which is fine but can't be undone. This removes the sale entirely.`
      : "This removes the sale entirely — it cannot be undone.";
    setPendingConfirm({
      title: "Delete this sale permanently?",
      message,
      confirmLabel: "Delete permanently",
      danger: true,
      onConfirm: () => {
        setPendingConfirm(null);
        setError(null);
        startTransition(async () => {
          const res = await deleteGallerySale(activePurchase.id, siteId);
          if (!res.ok) setError(res.error);
          if (onChanged) onChanged();
          else router.refresh();
        });
      },
    });
  };

  const handleGetLink = () => {
    if (!activePurchase) return;
    setError(null);
    setLinkUrl(null);
    startTransition(async () => {
      const result = await createPaymentLink(activePurchase.id, siteId, artworkId);
      if (result.ok) {
        setLinkUrl(result.url);
      } else {
        setError(result.error);
      }
    });
  };

  const handleEnterCard = () => {
    if (!activePurchase) return;
    setError(null);
    setCardSecret(null);
    setCardPublishableKey(null);
    startTransition(async () => {
      const result = await createCardEntryIntent(activePurchase.id, siteId);
      if (result.ok) {
        setCardSecret(result.clientSecret);
        setCardPublishableKey(result.publishableKey);
      } else {
        setError(result.error);
      }
    });
  };

  const paidCount = activePurchase?.payments.filter((p) => p.status === "PAID").length ?? 0;
  const releaseReached =
    !!activePurchase?.releaseTriggerCount && paidCount >= activePurchase.releaseTriggerCount;

  const gallerySalePriceNum = parseFloat(gallerySalePrice) || 0;
  const commissionNum = parseFloat(commissionPercent) || 0;
  const galleryNet = gallerySalePriceNum - gallerySalePriceNum * (commissionNum / 100);

  const pastSalePriceNum = parseFloat(pastSalePrice) || 0;
  const pastCommissionNum = parseFloat(pastCommissionPercent) || 0;
  const pastNet = pastSalePriceNum - pastSalePriceNum * (pastCommissionNum / 100);

  return (
    <div className="space-y-6">
      {!terms && (
        <p className="text-sm text-neutral-400">
          Set a price on the Presentation tab before starting a sale.
        </p>
      )}

      {terms && !activePurchase && (
        <div className="rounded-md border border-neutral-200 p-4">
          <h4 className="mb-1 text-sm font-medium text-neutral-700">Start a sale</h4>
          <p className="mb-3 text-xs text-neutral-400">
            Buyer details belong to the sale, not the artwork — nothing here is saved until you
            start the sale below.
          </p>

          <div className="mb-4 flex gap-2 border-b border-neutral-200">
            <button
              type="button"
              onClick={() => setChannel("STRIPE")}
              className={`px-3 py-1.5 text-sm font-medium ${
                channel === "STRIPE"
                  ? "border-b-2 border-neutral-900 text-neutral-900"
                  : "text-neutral-400 hover:text-neutral-600"
              }`}
            >
              Sold via Stripe
            </button>
            <button
              type="button"
              onClick={() => setChannel("GALLERY")}
              className={`px-3 py-1.5 text-sm font-medium ${
                channel === "GALLERY"
                  ? "border-b-2 border-neutral-900 text-neutral-900"
                  : "text-neutral-400 hover:text-neutral-600"
              }`}
            >
              Sold via Gallery
            </button>
            <button
              type="button"
              onClick={() => setChannel("PAST")}
              className={`px-3 py-1.5 text-sm font-medium ${
                channel === "PAST"
                  ? "border-b-2 border-neutral-900 text-neutral-900"
                  : "text-neutral-400 hover:text-neutral-600"
              }`}
            >
              Record Past Sale
            </button>
          </div>

          {channel === "STRIPE" ? (
            <form
              onSubmit={(e) => e.preventDefault()}
              className="space-y-3"
            >
              <CustomerPicker
                artistId={artistId}
                onSelect={(c: CustomerSummary) => {
                  setStripeBuyerName(c.name);
                  setStripeBuyerEmail(c.email || "");
                }}
              />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Buyer name
                  </label>
                  <input
                    type="text"
                    name="buyerName"
                    value={stripeBuyerName}
                    onChange={(e) => setStripeBuyerName(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Buyer email
                  </label>
                  <input
                    type="email"
                    name="buyerEmail"
                    required
                    value={stripeBuyerEmail}
                    onChange={(e) => setStripeBuyerEmail(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-neutral-700">
                  Purchase option
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {saleOptions.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => setSelectedOption(o.key)}
                      className={`rounded-md border-2 p-3 text-left ${
                        selectedOption === o.key
                          ? "border-neutral-900 bg-neutral-50"
                          : "border-neutral-200 hover:border-neutral-300"
                      }`}
                    >
                      <p className="text-sm font-medium text-neutral-900">{o.label}</p>
                      <p className="text-sm text-neutral-600">
                        {formatMoney(o.amount, terms.currency)}
                        {o.perInstalment && (
                          <span className="text-neutral-400">
                            {" "}
                            ({formatMoney(o.perInstalment, terms.currency)} each)
                          </span>
                        )}
                      </p>
                    </button>
                  ))}
                </div>
                <input type="hidden" name="type" value={activeOption?.type ?? "FULL"} />
                <input
                  type="hidden"
                  name="framed"
                  value={activeOption?.framed ? "true" : "false"}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Sale source
                </label>
                <select
                  name="source"
                  defaultValue=""
                  className="w-full max-w-[calc(50%-0.5rem)] rounded-md border border-neutral-300 px-3 py-2 text-sm"
                >
                  <option value="">— Not set —</option>
                  {saleSources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={(e) =>
                    handleStartAndGetLink(new FormData(e.currentTarget.form!))
                  }
                  disabled={isPending}
                  className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                >
                  Get payment link
                </button>
                <button
                  type="button"
                  onClick={(e) =>
                    handleStartAndEnterCard(new FormData(e.currentTarget.form!))
                  }
                  disabled={isPending}
                  className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
                >
                  Enter card now
                </button>
              </div>
              <p className="text-xs text-neutral-400">
                Either option saves the buyer&apos;s card on file, so future instalments (if any)
                can be charged automatically without them needing to be present.
              </p>
            </form>
          ) : channel === "GALLERY" ? (
            <form action={handleStartGallerySale} className="space-y-3">
              <p className="text-xs text-neutral-400">
                No card is taken here — this raises an unpaid invoice for the net amount, which
                you mark as paid manually once the gallery actually pays.
              </p>
              <CustomerPicker
                artistId={artistId}
                onSelect={(c: CustomerSummary) => {
                  setGalleryBuyerName(c.name);
                  setGalleryBuyerEmail(c.email || "");
                  setGalleryBuyerAddress(c.address || "");
                }}
              />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Gallery / buyer name
                  </label>
                  <input
                    type="text"
                    name="buyerName"
                    required
                    value={galleryBuyerName}
                    onChange={(e) => setGalleryBuyerName(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Email (optional)
                  </label>
                  <input
                    type="email"
                    name="buyerEmail"
                    value={galleryBuyerEmail}
                    onChange={(e) => setGalleryBuyerEmail(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Billing address <span className="font-normal text-neutral-400">(for the invoice)</span>
                </label>
                <textarea
                  name="buyerAddress"
                  rows={2}
                  value={galleryBuyerAddress}
                  onChange={(e) => setGalleryBuyerAddress(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Sale price
                  </label>
                  <input
                    type="text"
                    name="totalAmount"
                    required
                    value={gallerySalePrice}
                    onChange={(e) => setGallerySalePrice(e.target.value)}
                    placeholder="e.g. 250.00"
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Currency
                  </label>
                  <select
                    name="currency"
                    value={gallerySaleCurrency}
                    onChange={(e) => setGallerySaleCurrency(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Commission %
                  </label>
                  <input
                    type="text"
                    name="commissionPercent"
                    value={commissionPercent}
                    onChange={(e) => setCommissionPercent(e.target.value)}
                    placeholder="e.g. 45"
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Net owed
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={
                      gallerySalePriceNum
                        ? formatMoney(galleryNet.toFixed(2), gallerySaleCurrency)
                        : "—"
                    }
                    className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Sale source
                </label>
                <select
                  name="source"
                  defaultValue=""
                  className="w-full max-w-[calc(50%-0.5rem)] rounded-md border border-neutral-300 px-3 py-2 text-sm"
                >
                  <option value="">— Not set —</option>
                  {saleSources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                Start sale
              </button>
            </form>
          ) : (
            <form action={handleRecordPastSale} className="space-y-3">
              <p className="text-xs text-neutral-400">
                For sales that already happened — no card is taken and nothing is left owing.
                This records it as fully paid straight away, backdated to when it actually sold,
                and marks the artwork Sold.
              </p>
              <CustomerPicker
                artistId={artistId}
                onSelect={(c: CustomerSummary) => {
                  setPastBuyerName(c.name);
                  setPastBuyerEmail(c.email || "");
                  setPastBuyerAddress(c.address || "");
                }}
              />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Buyer / gallery name
                  </label>
                  <input
                    type="text"
                    name="buyerName"
                    required
                    value={pastBuyerName}
                    onChange={(e) => setPastBuyerName(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Email (optional)
                  </label>
                  <input
                    type="email"
                    name="buyerEmail"
                    value={pastBuyerEmail}
                    onChange={(e) => setPastBuyerEmail(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Address <span className="font-normal text-neutral-400">(optional)</span>
                </label>
                <textarea
                  name="buyerAddress"
                  rows={2}
                  value={pastBuyerAddress}
                  onChange={(e) => setPastBuyerAddress(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-5 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Sale price
                  </label>
                  <input
                    type="text"
                    name="totalAmount"
                    required
                    value={pastSalePrice}
                    onChange={(e) => setPastSalePrice(e.target.value)}
                    placeholder="e.g. 250.00"
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Currency
                  </label>
                  <select
                    name="currency"
                    value={pastSaleCurrency}
                    onChange={(e) => setPastSaleCurrency(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Commission % <span className="font-normal text-neutral-400">(if any)</span>
                  </label>
                  <input
                    type="text"
                    name="commissionPercent"
                    value={pastCommissionPercent}
                    onChange={(e) => setPastCommissionPercent(e.target.value)}
                    placeholder="e.g. 45"
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Net received
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={
                      pastSalePriceNum ? formatMoney(pastNet.toFixed(2), pastSaleCurrency) : "—"
                    }
                    className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Date it sold
                  </label>
                  <input
                    type="date"
                    name="saleDate"
                    required
                    max={new Date().toISOString().slice(0, 10)}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Sale source
                </label>
                <input
                  type="text"
                  name="source"
                  placeholder="Historical"
                  className="w-full max-w-[calc(50%-0.5rem)] rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                Record sale
              </button>
            </form>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      )}

      {activePurchase && (
        <div className="rounded-md border border-neutral-200 p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h4 className="text-sm font-medium text-neutral-700">
              {activePurchase.channel === "GALLERY"
                ? "Gallery sale"
                : activePurchase.type === "FULL"
                  ? "Full payment"
                  : `${activePurchase.instalmentCount} instalments`}
              {activePurchase.framed && (
                <span className="ml-1.5 text-xs font-normal text-neutral-400">(Framed)</span>
              )}
            </h4>
            <span className="text-sm text-neutral-900">
              {formatMoney(activePurchase.totalAmount, activePurchase.currency)}
            </span>
          </div>
          <p className="mb-3 text-xs text-neutral-500">
            {activePurchase.buyerName}
            {activePurchase.buyerName && activePurchase.buyerEmail ? " · " : ""}
            {activePurchase.buyerEmail}
            {activePurchase.source ? ` · ${activePurchase.source}` : ""}
          </p>

          {activePurchase.channel === "GALLERY" ? (
            <div className="mb-3">
              <span className="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                UNPAID
              </span>
              {activePurchase.commissionPercent && (
                <p className="mt-2 text-xs text-neutral-500">
                  Commission {activePurchase.commissionPercent}% — net owed{" "}
                  {formatMoney(
                    (
                      parseFloat(activePurchase.totalAmount) *
                      (1 - parseFloat(activePurchase.commissionPercent) / 100)
                    ).toFixed(2),
                    activePurchase.currency
                  )}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleMarkPaid}
                  disabled={isPending}
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                >
                  Mark as paid
                </button>
                <button
                  type="button"
                  onClick={() => downloadInvoice(activePurchase.id)}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                >
                  Download invoice
                </button>
              </div>
            </div>
          ) : activePurchase.payments.length === 0 ? (
            <>
              <p className="mb-3 text-xs text-neutral-400">
                Either option saves the buyer&apos;s card on file, so future instalments (if any)
                can be charged automatically without them needing to be present.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleGetLink}
                  disabled={isPending}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
                >
                  Get payment link
                </button>
                <button
                  type="button"
                  onClick={handleEnterCard}
                  disabled={isPending}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
                >
                  Enter card now
                </button>
              </div>

              {linkUrl && (
                <div className="mt-3 rounded-md bg-neutral-50 p-3">
                  <p className="mb-1 text-xs text-neutral-500">
                    Send this link to the buyer (copy and paste — nothing is emailed
                    automatically):
                  </p>
                  <input
                    readOnly
                    value={linkUrl}
                    onFocus={(e) => e.target.select()}
                    className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs"
                  />
                </div>
              )}

              {cardSecret && cardPublishableKey && (
                <div className="mt-3">
                  <StripeCardForm
                    clientSecret={cardSecret}
                    publishableKey={cardPublishableKey}
                    onDone={() => {
                      setCardSecret(null);
                      setCardPublishableKey(null);
                      if (onChanged) onChanged();
                      else router.refresh();
                    }}
                  />
                  <p className="mt-2 text-xs text-neutral-400">
                    Status below updates within a few seconds of Stripe confirming the charge.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-neutral-400">
                    <th className="pb-1 font-normal">#</th>
                    <th className="pb-1 font-normal">Amount</th>
                    <th className="pb-1 font-normal">Status</th>
                    <th className="pb-1 font-normal">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {activePurchase.payments.map((p) => (
                    <tr key={p.id} className="border-t border-neutral-100">
                      <td className="py-1.5 text-neutral-500">{p.sequence}</td>
                      <td className="py-1.5">{formatMoney(p.amount, p.currency)}</td>
                      <td className="py-1.5">
                        <span
                          className={
                            p.status === "PAID"
                              ? "text-green-600"
                              : p.status === "FAILED"
                                ? "text-red-600"
                                : "text-neutral-500"
                          }
                        >
                          {p.status === "PAID" ? "Paid" : p.status === "FAILED" ? "Failed" : "Due"}
                        </span>
                      </td>
                      <td className="py-1.5 text-neutral-500">
                        {p.paidDate
                          ? new Date(p.paidDate).toLocaleDateString()
                          : p.dueDate
                            ? new Date(p.dueDate).toLocaleDateString()
                            : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={() => downloadInvoice(activePurchase.id)}
                className="mt-3 rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Download invoice
              </button>
            </>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          {activePurchase.type === "INSTALMENTS" && (
            <form action={handleSaveRelease} className="mt-4 space-y-3 border-t border-neutral-100 pt-4">
              <h5 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Release message for this sale
              </h5>
              {releaseReached && (
                <p className="rounded bg-green-50 px-2 py-1 text-xs text-green-700">
                  Trigger reached — this message now applies.
                </p>
              )}
              <textarea
                name="releaseMessage"
                defaultValue={activePurchase.releaseMessage ?? ""}
                rows={2}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                type="number"
                name="releaseTriggerCount"
                min={1}
                defaultValue={activePurchase.releaseTriggerCount ?? ""}
                placeholder="Release after this many payments"
                className="w-full max-w-[calc(50%-0.5rem)] rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
                >
                  Save
                </button>
                {saved && <span className="text-sm text-green-600">Saved</span>}
              </div>
            </form>
          )}

          <div className={activePurchase.type === "INSTALMENTS" ? "mt-3" : "mt-4 border-t border-neutral-100 pt-4"}>
            <button
              type="button"
              onClick={handleAbandon}
              disabled={isPending}
              className="text-sm text-red-600 hover:underline disabled:opacity-50"
            >
              Cancel sale
            </button>
            <span className="mx-2 text-neutral-300">·</span>
            <button
              type="button"
              onClick={handleDeleteActiveSale}
              disabled={isPending}
              className="text-sm text-red-600 hover:underline disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
            Past sale attempts
          </h4>
          <div className="space-y-2">
            {history.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-md border border-neutral-100 px-3 py-2 text-sm"
              >
                <div>
                  <span className="text-neutral-700">{p.buyerName || p.buyerEmail}</span>
                  <span className="ml-2 text-neutral-400">
                    {formatMoney(p.totalAmount, p.currency)}
                    {p.framed && " (Framed)"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={p.status === "COMPLETED" ? "text-green-600" : "text-neutral-400"}
                  >
                    {p.status === "COMPLETED" ? "Completed" : "Abandoned"}
                  </span>
                  <span className="text-neutral-400">
                    {p.closedAt ? new Date(p.closedAt).toLocaleDateString() : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => downloadInvoice(p.id)}
                    className="text-neutral-500 hover:underline"
                  >
                    {p.status === "COMPLETED" ? "Receipt" : "Invoice"}
                  </button>
                  {p.status !== "COMPLETED" && (
                    <button
                      type="button"
                      onClick={() => handleDeleteHistoryItem(p)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                  {p.status === "COMPLETED" && (
                    <button
                      type="button"
                      onClick={() => handleForceDeleteCompleted(p)}
                      className="text-red-600 hover:underline"
                    >
                      Force delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ""}
        message={pendingConfirm?.message ?? ""}
        confirmLabel={pendingConfirm?.confirmLabel ?? ""}
        danger={pendingConfirm?.danger}
        onConfirm={() => pendingConfirm?.onConfirm()}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
}
