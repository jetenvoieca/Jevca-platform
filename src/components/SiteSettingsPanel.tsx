"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import StatusSelect from "@/components/StatusSelect";
import ArchiveButton from "@/components/ArchiveButton";
import {
  updateSite,
  updateArtist,
  updateArtistStripeMode,
  updateSalesEnabled,
  saveArtistLogo,
  regenerateHopperToken,
} from "@/lib/actions";
import {
  updateArtistPaymentMethod,
  updateStripeSubscriptionCustomerId,
  addManualSubscriptionPayment,
  deleteManualSubscriptionPayment,
} from "@/lib/actions/subscriptions";
import { requestUploadUrl } from "@/lib/actions/media";
import { getSalesResetPreview, resetArtistSalesData } from "@/lib/actions/sales";

type SubscriptionPaymentRow = {
  id: string;
  source: "STRIPE" | "MANUAL";
  amount: string;
  currency: string;
  paidAt: string; // ISO date, yyyy-mm-dd
};

type SiteData = {
  id: string;
  name: string;
  domain: string | null;
  status: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED" | "ISYT";
  createdAt: string;
  defaultCurrency: string;
  template: string;
  salesEnabled: boolean;
  domainStatus: string | null;
  domainRenewalDate: string;
};

type ArtistData = {
  id: string;
  name: string;
  firstName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  subscriptionAmount: string;
  paymentMethod: string | null;
  logoUrl: string | null;
  invoiceAddress: string | null;
  vatNumber: string | null;
  vatRate: string;
  invoiceFooterText: string | null;
  invoiceLanguage: string;
  nextInvoiceNumber: number;
  hopperToken: string;
  stripeMode: "TEST" | "LIVE";
  stripeSubscriptionCustomerId: string | null;
  stripeSubscriptionStatus: string | null;
};

export default function SiteSettingsPanel({
  site,
  artist,
  subscriptionPayments,
}: {
  site: SiteData;
  artist: ArtistData;
  subscriptionPayments: SubscriptionPaymentRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [savedField, setSavedField] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [regeneratingToken, setRegeneratingToken] = useState(false);
  const [resettingSales, setResettingSales] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [switchingStripeMode, setSwitchingStripeMode] = useState(false);
  const [addingPayment, setAddingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const router = useRouter();

  const flash = (field: string) => {
    setSavedField(field);
    setTimeout(() => setSavedField(null), 1500);
  };

  const saveSite = (
    field: "name" | "domain" | "defaultCurrency" | "template" | "domainStatus" | "domainRenewalDate",
    value: string
  ) => {
    const fd = new FormData();
    fd.set("name", field === "name" ? value : site.name);
    fd.set("domain", field === "domain" ? value : site.domain || "");
    fd.set("defaultCurrency", field === "defaultCurrency" ? value : site.defaultCurrency);
    fd.set("template", field === "template" ? value : site.template);
    fd.set("domainStatus", field === "domainStatus" ? value : site.domainStatus || "");
    fd.set("domainRenewalDate", field === "domainRenewalDate" ? value : site.domainRenewalDate);
    startTransition(async () => {
      await updateSite(site.id, fd);
      router.refresh();
      flash(field);
    });
  };

  const saveOwner = (
    field:
      | "name"
      | "firstName"
      | "email"
      | "phone"
      | "notes"
      | "subscriptionAmount"
      | "invoiceAddress"
      | "vatNumber"
      | "vatRate"
      | "invoiceFooterText"
      | "invoiceLanguage"
      | "nextInvoiceNumber",
    value: string
  ) => {
    const fd = new FormData();
    fd.set("name", field === "name" ? value : artist.name);
    fd.set("firstName", field === "firstName" ? value : artist.firstName || "");
    fd.set("email", field === "email" ? value : artist.email || "");
    fd.set("phone", field === "phone" ? value : artist.phone || "");
    fd.set("notes", field === "notes" ? value : artist.notes || "");
    fd.set("subscriptionAmount", field === "subscriptionAmount" ? value : artist.subscriptionAmount);
    // paymentMethod now saved via its own action (updateArtistPaymentMethod)
    // but updateArtist still expects the field present so it doesn't get
    // accidentally cleared.
    fd.set("paymentMethod", artist.paymentMethod || "");
    fd.set("invoiceAddress", field === "invoiceAddress" ? value : artist.invoiceAddress || "");
    fd.set("vatNumber", field === "vatNumber" ? value : artist.vatNumber || "");
    fd.set("vatRate", field === "vatRate" ? value : artist.vatRate);
    fd.set("invoiceFooterText", field === "invoiceFooterText" ? value : artist.invoiceFooterText || "");
    fd.set("invoiceLanguage", field === "invoiceLanguage" ? value : artist.invoiceLanguage || "EN");
    if (field === "nextInvoiceNumber") fd.set("nextInvoiceNumber", value);
    startTransition(async () => {
      await updateArtist(artist.id, fd);
      router.refresh();
      flash(field);
    });
  };

  const handleStripeModeChange = (mode: "TEST" | "LIVE") => {
    if (mode === "LIVE") {
      const confirmed = confirm(
        `Switch ${artist.name} to LIVE Stripe payments?\n\n` +
          `Every sale taken for this artist from now on will charge a real card. ` +
          `Make sure you've already cleared out any test sales data first.`
      );
      if (!confirmed) return;
    }
    setSwitchingStripeMode(true);
    startTransition(async () => {
      await updateArtistStripeMode(artist.id, mode);
      router.refresh();
      setSwitchingStripeMode(false);
    });
  };

  const handleResetSalesData = async () => {
    setResetError(null);
    setResettingSales(true);
    try {
      const preview = await getSalesResetPreview(artist.id);
      const totalRecords = preview.purchaseCount + preview.paymentCount + preview.saleTermsCount;
      if (totalRecords === 0 && preview.artworksToResetCount === 0) {
        alert(`${preview.artistName} has no sales data to reset — nothing to do.`);
        return;
      }
      const confirmed = confirm(
        `Permanently delete ALL sales data for ${preview.artistName}?\n\n` +
          `• ${preview.purchaseCount} purchase${preview.purchaseCount === 1 ? "" : "s"}\n` +
          `• ${preview.paymentCount} payment${preview.paymentCount === 1 ? "" : "s"}\n` +
          `• ${preview.saleTermsCount} sale terms (pricing) record${preview.saleTermsCount === 1 ? "" : "s"}\n` +
          `• ${preview.artworksToResetCount} artwork${preview.artworksToResetCount === 1 ? "" : "s"} reset to Available\n\n` +
          `This cannot be undone. Real sales made after this point are unaffected.`
      );
      if (!confirmed) return;
      const result = await resetArtistSalesData(artist.id);
      if (!result.ok) {
        setResetError(result.error);
        return;
      }
      router.refresh();
      alert(`Done — ${preview.artistName}'s sales data has been reset.`);
    } finally {
      setResettingSales(false);
    }
  };

  const handleCopyToken = async (token: string) => {
    await navigator.clipboard.writeText(token);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 1500);
  };

  const handleRegenerateToken = () => {
    if (
      !confirm(
        "Regenerate this artist's Hopper token? Any copy of their iPhone Shortcut still using the old token will stop working until it's updated with the new one."
      )
    ) {
      return;
    }
    setRegeneratingToken(true);
    startTransition(async () => {
      await regenerateHopperToken(artist.id);
      router.refresh();
      setRegeneratingToken(false);
    });
  };

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const result = await requestUploadUrl(artist.id, file.name, file.type);
      if ("error" in result) {
        alert(result.error);
        return;
      }
      const putRes = await fetch(result.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        alert("Upload failed — please try again.");
        return;
      }
      await saveArtistLogo(artist.id, result.key);
      router.refresh();
    } finally {
      setLogoUploading(false);
    }
  };

  const handlePaymentMethodChange = (value: "" | "Stripe" | "PayPal" | "DD") => {
    startTransition(async () => {
      await updateArtistPaymentMethod(artist.id, site.id, value);
      router.refresh();
    });
  };

  const handleStripeCustomerIdBlur = (value: string) => {
    startTransition(async () => {
      await updateStripeSubscriptionCustomerId(artist.id, site.id, value);
      router.refresh();
      flash("stripeSubscriptionCustomerId");
    });
  };

  const handleAddPayment = async (formData: FormData) => {
    setPaymentError(null);
    const result = await addManualSubscriptionPayment(artist.id, site.id, formData);
    if (!result.ok) {
      setPaymentError(result.error);
      return;
    }
    setAddingPayment(false);
    router.refresh();
  };

  const handleDeletePayment = (id: string) => {
    if (!confirm("Delete this payment record? This can't be undone.")) return;
    startTransition(async () => {
      await deleteManualSubscriptionPayment(id, site.id);
      router.refresh();
    });
  };

  const subscriptionTotal = subscriptionPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

  const labelCls = "mb-1 block text-xs text-neutral-500";
  const inputCls =
    "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:opacity-50";
  const cardCls = "rounded-lg border border-neutral-200 bg-white p-4";
  const cardTitleCls = "mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500";

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      {/* Header — name, status, open/archive controls. Not tucked inside
          any one column since it applies to the whole site. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 pb-4">
        <div className="min-w-0 flex-1">
          <input
            key={`name-${site.id}`}
            type="text"
            defaultValue={site.name}
            onBlur={(e) => e.target.value.trim() && saveSite("name", e.target.value.trim())}
            disabled={isPending}
            className="w-full max-w-md rounded-md border border-transparent px-1 py-0.5 -mx-1 text-2xl font-semibold text-neutral-900 hover:border-neutral-300 focus:border-neutral-300 disabled:opacity-50"
          />
          <p className="mt-1 px-1 text-sm text-neutral-500">Owner: {artist.name}</p>
          {savedField === "name" && <p className="px-1 text-xs text-green-600">Saved</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {site.status === "ARCHIVED" ? (
            <span className="text-sm text-neutral-400">Archived</span>
          ) : (
            <StatusSelect siteId={site.id} status={site.status} />
          )}
          <ArchiveButton siteId={site.id} isArchived={site.status === "ARCHIVED"} />
          <Link
            href={`/sites/${site.id}/open`}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Open Site →
          </Link>
        </div>
      </div>

      <div
        className={`grid gap-4 ${
          site.salesEnabled ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1 lg:grid-cols-2"
        }`}
      >
        {/* ---- OWNER ---- */}
        <div className={cardCls}>
          <p className={cardTitleCls}>Owner</p>

          <div className="space-y-2">
            <div>
              <label className={labelCls}>Name</label>
              <input
                key={`owner-name-${artist.id}`}
                type="text"
                defaultValue={artist.name}
                onBlur={(e) => e.target.value.trim() && saveOwner("name", e.target.value.trim())}
                disabled={isPending}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>First name (for personalised emails)</label>
              <input
                key={`owner-firstname-${artist.id}`}
                type="text"
                defaultValue={artist.firstName || ""}
                onBlur={(e) => saveOwner("firstName", e.target.value.trim())}
                disabled={isPending}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input
                key={`owner-email-${artist.id}`}
                type="email"
                defaultValue={artist.email || ""}
                onBlur={(e) => saveOwner("email", e.target.value.trim())}
                disabled={isPending}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input
                key={`owner-phone-${artist.id}`}
                type="text"
                defaultValue={artist.phone || ""}
                onBlur={(e) => saveOwner("phone", e.target.value.trim())}
                disabled={isPending}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <textarea
                key={`owner-notes-${artist.id}`}
                defaultValue={artist.notes || ""}
                onBlur={(e) => saveOwner("notes", e.target.value.trim())}
                disabled={isPending}
                rows={2}
                className={inputCls}
              />
            </div>
            {(savedField === "name" ||
              savedField === "firstName" ||
              savedField === "email" ||
              savedField === "phone" ||
              savedField === "notes") && <p className="text-xs text-green-600">Saved</p>}
          </div>

          <div className="mt-4 border-t border-neutral-200 pt-4">
            <label className={labelCls}>Domain</label>
            <input
              key={`domain-${site.id}`}
              type="text"
              defaultValue={site.domain || ""}
              placeholder="e.g. janedoeartist.com"
              onBlur={(e) => saveSite("domain", e.target.value.trim())}
              disabled={isPending}
              className={inputCls}
            />
            {savedField === "domain" && <p className="mt-1 text-xs text-green-600">Saved</p>}

            <div className="mt-3 rounded-md border border-neutral-200 p-2.5">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                Domain renewal
              </p>
              <label className={labelCls}>Status</label>
              <select
                key={`domain-status-${site.id}`}
                defaultValue={site.domainStatus || ""}
                onChange={(e) => saveSite("domainStatus", e.target.value)}
                disabled={isPending}
                className={`${inputCls} mb-2`}
              >
                <option value="">— Not checked —</option>
                <option value="Active">Active</option>
                <option value="Expiring soon">Expiring soon</option>
                <option value="Expired">Expired</option>
              </select>

              <label className={labelCls}>Renewal date</label>
              <input
                key={`domain-renewal-date-${site.id}`}
                type="date"
                defaultValue={site.domainRenewalDate}
                onChange={(e) => saveSite("domainRenewalDate", e.target.value)}
                disabled={isPending}
                className={inputCls}
              />
              {(savedField === "domainStatus" || savedField === "domainRenewalDate") && (
                <p className="mt-1 text-xs text-green-600">Saved</p>
              )}
              <p className="mt-2 text-xs text-neutral-400">
                Editable here, or updated in bulk via Namecheap Sync.
              </p>
            </div>

            <label className={`${labelCls} mt-3`}>Template</label>
            <select
              key={`template-${site.id}`}
              defaultValue={site.template}
              onChange={(e) => saveSite("template", e.target.value)}
              disabled={isPending}
              className={inputCls}
            >
              <option value="Default">Default</option>
            </select>
            {savedField === "template" && <p className="mt-1 text-xs text-green-600">Saved</p>}
            <p className="mt-1 text-xs text-neutral-400">
              Place-marker for when multiple public-site templates exist — not wired to anything
              yet.
            </p>

            <label className={`${labelCls} mt-3`}>Default currency</label>
            <select
              key={`currency-${site.id}`}
              defaultValue={site.defaultCurrency}
              onChange={(e) => saveSite("defaultCurrency", e.target.value)}
              disabled={isPending}
              className={inputCls}
            >
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
            </select>
            {savedField === "defaultCurrency" && <p className="mt-1 text-xs text-green-600">Saved</p>}

            <label className="mt-3 flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={site.salesEnabled}
                disabled={isPending}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  startTransition(async () => {
                    await updateSalesEnabled(site.id, enabled);
                    router.refresh();
                  });
                }}
              />
              Take payments
            </label>
            <p className="mt-1 text-xs text-neutral-400">
              Off by default — only for sites that actually sell art directly. Turns on the Sales
              and Customers pages, and the Invoicing panel here.
            </p>
          </div>

          <div className="mt-4 rounded-md border border-neutral-200 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
              Hopper Token
            </p>
            <p className="mb-2 text-xs text-neutral-400">
              Paste this into this artist&apos;s copy of the iPhone Shortcut, so photos and video
              they share land in their Hopper.
            </p>
            <div className="flex items-center gap-2">
              <input
                key={`owner-hopper-token-${artist.id}`}
                type="text"
                readOnly
                value={artist.hopperToken}
                onFocus={(e) => e.target.select()}
                className="w-full rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 font-mono text-xs text-neutral-700"
              />
              <button
                type="button"
                onClick={() => handleCopyToken(artist.hopperToken)}
                className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
              >
                {tokenCopied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              type="button"
              disabled={regeneratingToken}
              onClick={handleRegenerateToken}
              className="mt-2 text-xs text-red-600 hover:underline disabled:opacity-50"
            >
              {regeneratingToken ? "Regenerating…" : "Regenerate token"}
            </button>
          </div>
        </div>

        {/* ---- INVOICING (only if this site takes payments) ---- */}
        {site.salesEnabled && (
          <div className={cardCls}>
            <p className={cardTitleCls}>Invoicing</p>

            <label className={labelCls}>Logo</label>
            <div className="mb-3 flex items-center gap-2">
              {artist.logoUrl ? (
                <img
                  src={artist.logoUrl}
                  alt=""
                  className="h-10 w-10 rounded border border-neutral-200 object-contain"
                />
              ) : (
                <div className="h-10 w-10 rounded border border-dashed border-neutral-300" />
              )}
              <label className="cursor-pointer rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">
                {logoUploading ? "Uploading…" : "Upload…"}
                <input
                  type="file"
                  accept="image/*"
                  disabled={logoUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoUpload(file);
                  }}
                  className="hidden"
                />
              </label>
            </div>

            <label className={labelCls}>Artist address (for invoices)</label>
            <textarea
              key={`owner-invoice-address-${artist.id}`}
              defaultValue={artist.invoiceAddress || ""}
              onBlur={(e) => saveOwner("invoiceAddress", e.target.value.trim())}
              disabled={isPending}
              rows={2}
              className={`${inputCls} mb-3`}
            />

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>VAT number</label>
                <input
                  key={`owner-vat-number-${artist.id}`}
                  type="text"
                  defaultValue={artist.vatNumber || ""}
                  onBlur={(e) => saveOwner("vatNumber", e.target.value.trim())}
                  disabled={isPending}
                  placeholder="Blank = not VAT registered"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>VAT rate %</label>
                <input
                  key={`owner-vat-rate-${artist.id}`}
                  type="text"
                  inputMode="decimal"
                  defaultValue={artist.vatRate}
                  onBlur={(e) => saveOwner("vatRate", e.target.value.trim())}
                  disabled={isPending}
                  placeholder="e.g. 20"
                  className={inputCls}
                />
              </div>
            </div>

            <label className={labelCls}>Invoice language</label>
            <select
              key={`owner-invoice-language-${artist.id}`}
              defaultValue={artist.invoiceLanguage || "EN"}
              onChange={(e) => saveOwner("invoiceLanguage", e.target.value)}
              disabled={isPending}
              className={`${inputCls} mb-3`}
            >
              <option value="EN">English</option>
              <option value="FR">French</option>
            </select>

            <label className={labelCls}>Invoice footer text</label>
            <textarea
              key={`owner-invoice-footer-${artist.id}`}
              defaultValue={artist.invoiceFooterText || ""}
              onBlur={(e) => saveOwner("invoiceFooterText", e.target.value.trim())}
              disabled={isPending}
              placeholder="e.g. VAT exemption note, bank details, thank-you message…"
              rows={3}
              className={`${inputCls} mb-3`}
            />

            <label className={labelCls}>Next invoice number</label>
            <input
              key={`owner-next-invoice-${artist.id}`}
              type="number"
              defaultValue={artist.nextInvoiceNumber}
              onBlur={(e) =>
                e.target.value.trim() && saveOwner("nextInvoiceNumber", e.target.value.trim())
              }
              disabled={isPending}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-neutral-400">
              Set once as a starting point — increments automatically after that each time an
              invoice is actually generated.
            </p>

            {(savedField === "invoiceAddress" ||
              savedField === "vatNumber" ||
              savedField === "vatRate" ||
              savedField === "invoiceFooterText" ||
              savedField === "invoiceLanguage" ||
              savedField === "nextInvoiceNumber") && (
              <p className="mt-2 text-xs text-green-600">Saved</p>
            )}

            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-amber-600">
                Stripe Mode (this artist's buyers)
              </p>
              <p className="mb-2 text-xs text-neutral-500">
                Test mode uses Stripe&apos;s fake test cards — nothing is ever actually charged.
                Live mode charges real cards. Every other artist stays independent of this change.
              </p>
              <select
                value={artist.stripeMode}
                disabled={switchingStripeMode}
                onChange={(e) => handleStripeModeChange(e.target.value as "TEST" | "LIVE")}
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                <option value="TEST">Test — no real charges</option>
                <option value="LIVE">Live — real payments</option>
              </select>
              {artist.stripeMode === "LIVE" && (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  ⚠ This artist is live. Real cards will be charged.
                </p>
              )}
            </div>

            <div className="mt-4 rounded-md border border-red-200 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-red-400">
                Danger Zone
              </p>
              <p className="mb-2 text-xs text-neutral-500">
                Permanently deletes every purchase, payment, and sale-terms (pricing) record for
                this artist, and resets any Sold/Reserved artwork back to Available. Use this to
                clear out test sales before starting to take real payments — it cannot be undone.
              </p>
              <button
                type="button"
                onClick={handleResetSalesData}
                disabled={resettingSales}
                className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {resettingSales ? "Checking…" : "Reset all sales data…"}
              </button>
              {resetError && <p className="mt-2 text-xs text-red-600">{resetError}</p>}
            </div>
          </div>
        )}

        {/* ---- SUBSCRIPTION (this artist paying us) ---- */}
        <div className={cardCls}>
          <p className={cardTitleCls}>Subscription</p>

          <label className={labelCls}>Current rate (informational)</label>
          <div className="mb-3 flex items-center gap-1">
            <span className="text-sm text-neutral-400">£</span>
            <input
              key={`owner-subscription-${artist.id}`}
              type="text"
              inputMode="decimal"
              defaultValue={artist.subscriptionAmount}
              onBlur={(e) => saveOwner("subscriptionAmount", e.target.value.trim())}
              disabled={isPending}
              placeholder="e.g. 9.95"
              className={inputCls}
            />
          </div>

          <label className={labelCls}>Payment method</label>
          <select
            key={`owner-payment-${artist.id}`}
            defaultValue={artist.paymentMethod || ""}
            onChange={(e) =>
              handlePaymentMethodChange(e.target.value as "" | "Stripe" | "PayPal" | "DD")
            }
            disabled={isPending}
            className={`${inputCls} mb-3`}
          >
            <option value="">—</option>
            <option value="Stripe">Stripe</option>
            <option value="PayPal">PayPal</option>
            <option value="DD">Direct Debit</option>
          </select>
          {(savedField === "subscriptionAmount" ||
            savedField === "stripeSubscriptionCustomerId") && (
            <p className="mb-3 text-xs text-green-600">Saved</p>
          )}

          {!artist.paymentMethod && (
            <p className="text-xs text-neutral-400">
              Choose a payment method above to set up subscription tracking.
            </p>
          )}

          {artist.paymentMethod === "Stripe" && (
            <div className="mb-3 rounded-md border border-neutral-200 p-2.5">
              <label className={labelCls}>Stripe Customer ID</label>
              <input
                key={`stripe-customer-id-${artist.id}`}
                type="text"
                defaultValue={artist.stripeSubscriptionCustomerId || ""}
                onBlur={(e) => handleStripeCustomerIdBlur(e.target.value.trim())}
                disabled={isPending}
                placeholder="cus_…"
                className={`${inputCls} font-mono`}
              />
              <p className="mt-1 text-xs text-neutral-400">
                From the platform Stripe account (separate from this artist&apos;s own Stripe
                Mode above) — paste it in once to link this artist to their subscription.
              </p>
              {artist.stripeSubscriptionStatus && (
                <p className="mt-2 text-xs">
                  Status: <span className="font-medium">{artist.stripeSubscriptionStatus}</span>
                </p>
              )}
              {!artist.stripeSubscriptionCustomerId && (
                <p className="mt-2 text-xs text-amber-700">
                  Not linked yet — payments won&apos;t appear below until this is set.
                </p>
              )}
            </div>
          )}

          {artist.paymentMethod === "Stripe" ? (
            <p className="mb-2 text-xs text-neutral-400">
              Payments sync here automatically from Stripe once webhook syncing is switched on.
            </p>
          ) : (
            (artist.paymentMethod === "PayPal" || artist.paymentMethod === "DD") && (
              <div className="mb-2">
                {addingPayment ? (
                  <form
                    action={handleAddPayment}
                    className="mb-2 flex flex-col gap-1.5 rounded-md border border-neutral-200 p-2"
                  >
                    <div className="flex gap-1.5">
                      <input
                        type="date"
                        name="paidAt"
                        required
                        className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs"
                      />
                      <input
                        type="text"
                        name="amount"
                        inputMode="decimal"
                        required
                        placeholder="Amount"
                        className="w-24 rounded border border-neutral-300 px-2 py-1 text-xs"
                      />
                      <input type="hidden" name="currency" value={site.defaultCurrency} />
                    </div>
                    {paymentError && <p className="text-xs text-red-600">{paymentError}</p>}
                    <div className="flex gap-1">
                      <button
                        type="submit"
                        className="flex-1 rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-700"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingPayment(false);
                          setPaymentError(null);
                        }}
                        className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingPayment(true)}
                    className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                  >
                    + Add payment
                  </button>
                )}
              </div>
            )
          )}

          {artist.paymentMethod && (
            <div className="overflow-hidden rounded-md border border-neutral-200">
              <table className="w-full text-xs">
                <thead className="bg-neutral-50 text-left text-neutral-400">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Date</th>
                    <th className="px-2 py-1.5 font-medium">Amount</th>
                    <th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptionPayments.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-3 text-center text-neutral-400">
                        No payments recorded yet.
                      </td>
                    </tr>
                  ) : (
                    subscriptionPayments.map((p) => (
                      <tr key={p.id} className="border-t border-neutral-100">
                        <td className="px-2 py-1.5">
                          {new Date(p.paidAt).toLocaleDateString()}
                        </td>
                        <td className="px-2 py-1.5">
                          {p.currency} {parseFloat(p.amount).toFixed(2)}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {p.source === "MANUAL" ? (
                            <button
                              type="button"
                              onClick={() => handleDeletePayment(p.id)}
                              className="text-neutral-400 hover:text-red-600"
                            >
                              Delete
                            </button>
                          ) : (
                            <span className="text-neutral-300">Stripe</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {subscriptionPayments.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-neutral-200 bg-neutral-50 font-medium">
                      <td className="px-2 py-1.5">Total</td>
                      <td className="px-2 py-1.5" colSpan={2}>
                        {subscriptionPayments[0]?.currency || site.defaultCurrency}{" "}
                        {subscriptionTotal.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
