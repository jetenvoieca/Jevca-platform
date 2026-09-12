"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import MediaPicker from "@/components/MediaPicker";
import {
  updateSite,
  updateArtist,
  updateArtistStripeMode,
  updateSalesEnabled,
  saveArtistLogo,
  saveArtistSignature,
  setArtistProfileImage,
  updateArtistStory,
} from "@/lib/actions";
import {
  toArtistFormFields,
  toSiteFormFields,
  buildArtistFormData,
  buildSiteFormData,
  type ArtistFormFields,
} from "@/lib/clientPanelTypes";
import { requestUploadUrl } from "@/lib/actions/media";
import { getSalesResetPreview, resetArtistSalesData } from "@/lib/actions/sales";
import CertificateTemplatesCard from "@/components/CertificateTemplatesCard";
import PaymentDefaultsCard from "@/components/PaymentDefaultsCard";
import type { CertificateTemplateRow } from "@/lib/actions/certificateSettings";

type SiteData = {
  id: string;
  name: string;
  domain: string | null;
  status: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED" | "ISYT";
  createdAt: string;
  defaultCurrency: string;
  // Replaces the old free-text `template` (2026-09-06) — a real link to
  // a Template record now (see Site.templateId in schema.prisma). Null
  // = no Template assigned.
  templateId: string | null;
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
  // Structured postal address (2026-09-06, reformed from a single
  // freeform `invoiceAddress` field, direct request — "reform the
  // Artist address field so it can be used wherever needed") — see the
  // matching note on Artist.addressLine1 in schema.prisma.
  addressLine1: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  vatNumber: string | null;
  vatRate: string;
  invoiceFooterText: string | null;
  invoiceLanguage: string;
  nextInvoiceNumber: number;
  hopperToken: string;
  stripeMode: "TEST" | "LIVE";
  stripeSubscriptionCustomerId: string | null;
  stripeSubscriptionStatus: string | null;
  profileImageUrl: string | null;
  story: string | null;
  // The Certificate of Authenticity's signature image (2026-09-03) —
  // see the matching note by saveArtistSignature in lib/actions.ts.
  signatureUrl: string | null;
  // This artist's own @jevca.art local part (2026-09-05, Email
  // Integration) — see the matching note on Artist.emailSlug in
  // schema.prisma. Null until one's been generated/assigned.
  emailSlug: string | null;
  // Payment plan defaults (2026-09-07, moved here from Artwork
  // Catalogue Settings — see PaymentDefaultsCard below).
  defaultInstalmentCount: number;
  defaultReleaseMessage: string;
  defaultReleaseTriggerCount: number;
};

// Financial-tab-only text fields — Owner/Domain/Subscription/Hopper
// Token moved out to their own reusable cards (2026-09-12, shared with
// the Administration → Clients page); everything left in this file is
// specific to this page's Financial/Personal Profile tabs.
type FinancialField =
  | "addressLine1"
  | "city"
  | "postcode"
  | "country"
  | "vatNumber"
  | "vatRate"
  | "invoiceFooterText"
  | "invoiceLanguage";

export default function SiteSettingsPanel({
  site,
  artist,
  certificateTemplates,
}: {
  site: SiteData;
  artist: ArtistData;
  // Certificate of Authenticity templates (2026-09-04) — see
  // CertificateTemplatesCard, rendered full-width below the
  // Financial/Invoicing row.
  certificateTemplates: CertificateTemplateRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [savedField, setSavedField] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [signatureUploading, setSignatureUploading] = useState(false);
  const [resettingSales, setResettingSales] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [switchingStripeMode, setSwitchingStripeMode] = useState(false);
  // 2026-08-31, direct request — this page toggles between "Financial"
  // and "Personal Profile". Financial defaults to hidden (Personal
  // Profile shown first) since it's the more sensitive of the two —
  // someone glancing at a shared screen sees the harmless tab, not
  // payment details, unless they deliberately switch.
  const [activeTab, setActiveTab] = useState<"financial" | "personal">("personal");
  const router = useRouter();

  const flash = (field: string) => {
    setSavedField(field);
    setTimeout(() => setSavedField(null), 1500);
  };

  // Default currency lives on the Financial tab (Owner/Domain/Status
  // moved to DomainCard, which handles its own updateSite calls) — see
  // buildSiteFormData in lib/clientPanelTypes.ts for why this still has
  // to resubmit every other site field unchanged.
  const saveDefaultCurrency = (value: string) => {
    const fd = buildSiteFormData(toSiteFormFields(site), { defaultCurrency: value });
    startTransition(async () => {
      await updateSite(site.id, fd);
      router.refresh();
      flash("defaultCurrency");
    });
  };

  // The remaining Owner-record fields that live on the Financial tab
  // (Invoicing address/VAT/footer/language) — see buildArtistFormData in
  // lib/clientPanelTypes.ts for why this still has to resubmit every
  // other artist field unchanged.
  const saveFinancialField = (field: FinancialField, value: string) => {
    const fd = buildArtistFormData(
      toArtistFormFields(artist),
      { [field]: value } as Partial<ArtistFormFields>
    );
    startTransition(async () => {
      await updateArtist(artist.id, fd);
      router.refresh();
      flash(field);
    });
  };

  const saveNextInvoiceNumber = (value: string) => {
    const fd = buildArtistFormData(toArtistFormFields(artist), { nextInvoiceNumber: value });
    startTransition(async () => {
      await updateArtist(artist.id, fd);
      router.refresh();
      flash("nextInvoiceNumber");
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

  // Same direct-to-R2 upload flow as the Logo above, saved to its own
  // signatureUrl field — see the note on saveArtistSignature in
  // lib/actions.ts for why this is deliberately separate from the Logo.
  const handleSignatureUpload = async (file: File) => {
    setSignatureUploading(true);
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
      await saveArtistSignature(artist.id, result.key);
      router.refresh();
    } finally {
      setSignatureUploading(false);
    }
  };

  const handleProfileImagePick = (imageId: string) => {
    startTransition(async () => {
      await setArtistProfileImage(artist.id, imageId);
      router.refresh();
    });
  };

  const handleStorySave = (value: string) => {
    startTransition(async () => {
      await updateArtistStory(artist.id, value);
      router.refresh();
      flash("story");
    });
  };

  const labelCls = "mb-1 block text-xs text-neutral-500";
  const inputCls =
    "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:opacity-50";
  const cardCls = "rounded-lg border border-neutral-200 bg-white p-4";
  const cardTitleCls = "mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500";
  const tabBtnCls = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-medium transition ${
      active ? "bg-neutral-200 text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
    }`;

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      {/* Former header (name/owner/status/archive) removed 2026-08-18,
          direct request — it duplicated the persistent per-site header
          in layout.tsx above this page, which now carries all of that
          instead (including an editable name field, moved there so
          renaming a site still works with this block gone). */}

      {/* 2026-09-12, direct request — this page shows only the artist-
          facing Financial/Personal Profile tabs now. Owner/Domain/
          Subscription/Hopper Token moved entirely to the Administration
          → Clients admin page (ClientOwnerPanel) — this "Profile" page,
          reached from inside a site's own menu, is not the place for
          that admin-only data. */}
      <div className="mb-4 inline-flex rounded-full border border-neutral-300 bg-white p-1">
            <button
              type="button"
              onClick={() => setActiveTab("financial")}
              className={tabBtnCls(activeTab === "financial")}
            >
              Financial
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("personal")}
              className={tabBtnCls(activeTab === "personal")}
            >
              Personal Profile
            </button>
          </div>

          {activeTab === "personal" ? (
            <div className={cardCls}>
              <p className={cardTitleCls}>Personal Profile</p>

              <div className="mb-4 w-48">
                <MediaPicker
                  artistId={artist.id}
                  siteId={site.id}
                  mode="single"
                  previewUrl={artist.profileImageUrl || undefined}
                  label="Image"
                  onSelect={(imgs) => {
                    if (imgs[0]) handleProfileImagePick(imgs[0].id);
                  }}
                />
              </div>

              <label className={labelCls}>Story</label>
              <textarea
                key={`story-${artist.id}`}
                defaultValue={artist.story || ""}
                onBlur={(e) => handleStorySave(e.target.value.trim())}
                disabled={isPending}
                rows={10}
                placeholder="This artist's story…"
                className={inputCls}
              />
              {savedField === "story" && <p className="mt-1 text-xs text-green-600">Saved</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                {/* ---- Financial: currency / take payments / Stripe mode / reset ---- */}
                <div className={`${cardCls} lg:w-72 lg:shrink-0`}>
                <p className={cardTitleCls}>Financial</p>

                <label className={labelCls}>Default currency</label>
                <select
                  key={`currency-${site.id}`}
                  defaultValue={site.defaultCurrency}
                  onChange={(e) => saveDefaultCurrency(e.target.value)}
                  disabled={isPending}
                  className={inputCls}
                >
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                </select>
                {savedField === "defaultCurrency" && (
                  <p className="mt-1 text-xs text-green-600">Saved</p>
                )}

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

                {site.salesEnabled && (
                  <>
                    <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-amber-600">
                        Stripe Mode (this artist's buyers)
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

                    <button
                      type="button"
                      onClick={handleResetSalesData}
                      disabled={resettingSales}
                      className="mt-4 rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {resettingSales ? "Checking…" : "Reset all sales data…"}
                    </button>
                    {resetError && <p className="mt-2 text-xs text-red-600">{resetError}</p>}
                  </>
                )}
              </div>

              {/* ---- Invoicing (only if this site takes payments) ---- */}
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

                  {/* Certificate of Authenticity signature (2026-09-03)
                      — its own upload, separate from Logo above, since
                      the two aren't always the same image for every
                      artist. */}
                  <label className={labelCls}>Signature</label>
                  <div className="mb-3 flex items-center gap-2">
                    {artist.signatureUrl ? (
                      <img
                        src={artist.signatureUrl}
                        alt=""
                        className="h-10 w-10 rounded border border-neutral-200 object-contain"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded border border-dashed border-neutral-300" />
                    )}
                    <label className="cursor-pointer rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">
                      {signatureUploading ? "Uploading…" : "Upload…"}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={signatureUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleSignatureUpload(file);
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Structured address (2026-09-06, reformed from a single
                      freeform field, direct request) — addressLine1 stays
                      a textarea (a street address can be more than one
                      line); City/Postcode/Country are their own fields so
                      other documents can pull just the piece they need
                      (e.g. the Certificate of Authenticity's signature
                      block needs only Postcode + Country). */}
                  <label className={labelCls}>Artist address (for invoices)</label>
                  <textarea
                    key={`owner-address-line1-${artist.id}`}
                    defaultValue={artist.addressLine1 || ""}
                    onBlur={(e) => saveFinancialField("addressLine1", e.target.value.trim())}
                    disabled={isPending}
                    rows={2}
                    placeholder="Street address"
                    className={`${inputCls} mb-2`}
                  />
                  <div className="mb-3 grid grid-cols-3 gap-2">
                    <div>
                      <label className={labelCls}>City</label>
                      <input
                        key={`owner-city-${artist.id}`}
                        type="text"
                        defaultValue={artist.city || ""}
                        onBlur={(e) => saveFinancialField("city", e.target.value.trim())}
                        disabled={isPending}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Postcode</label>
                      <input
                        key={`owner-postcode-${artist.id}`}
                        type="text"
                        defaultValue={artist.postcode || ""}
                        onBlur={(e) => saveFinancialField("postcode", e.target.value.trim())}
                        disabled={isPending}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Country</label>
                      <input
                        key={`owner-country-${artist.id}`}
                        type="text"
                        defaultValue={artist.country || ""}
                        onBlur={(e) => saveFinancialField("country", e.target.value.trim())}
                        disabled={isPending}
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>VAT number</label>
                      <input
                        key={`owner-vat-number-${artist.id}`}
                        type="text"
                        defaultValue={artist.vatNumber || ""}
                        onBlur={(e) => saveFinancialField("vatNumber", e.target.value.trim())}
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
                        onBlur={(e) => saveFinancialField("vatRate", e.target.value.trim())}
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
                    onChange={(e) => saveFinancialField("invoiceLanguage", e.target.value)}
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
                    onBlur={(e) => saveFinancialField("invoiceFooterText", e.target.value.trim())}
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
                      e.target.value.trim() && saveNextInvoiceNumber(e.target.value.trim())
                    }
                    disabled={isPending}
                    className={inputCls}
                  />
                  <p className="mt-1 text-xs text-neutral-400">
                    Set once as a starting point — increments automatically after that each time an
                    invoice is actually generated.
                  </p>

                  {(savedField === "addressLine1" ||
                    savedField === "city" ||
                    savedField === "postcode" ||
                    savedField === "country" ||
                    savedField === "vatNumber" ||
                    savedField === "vatRate" ||
                    savedField === "invoiceFooterText" ||
                    savedField === "invoiceLanguage" ||
                    savedField === "nextInvoiceNumber") && (
                    <p className="mt-2 text-xs text-green-600">Saved</p>
                  )}
                </div>
              )}
              </div>

              {/* Certificate of Authenticity templates (2026-09-04) —
                  full width, below the Financial/Invoicing row, same
                  "only relevant once this site takes payments" gating
                  as Invoicing above. */}
              {site.salesEnabled && (
                <CertificateTemplatesCard
                  artistId={artist.id}
                  siteId={site.id}
                  templates={certificateTemplates}
                />
              )}

              {/* Payment plan defaults (2026-09-07) — moved here from
                  the Artwork Catalogue's own Settings page: these are
                  financial terms, so they belong on the Financial tab,
                  not Catalogue/Type/Group settings. Same "only relevant
                  once this site takes payments" gating as Invoicing/
                  Certificate above. */}
              {site.salesEnabled && (
                <div className="lg:w-72">
                  <PaymentDefaultsCard
                    artistId={artist.id}
                    siteId={site.id}
                    defaultInstalmentCount={artist.defaultInstalmentCount}
                    defaultReleaseMessage={artist.defaultReleaseMessage}
                    defaultReleaseTriggerCount={artist.defaultReleaseTriggerCount}
                  />
                </div>
              )}
            </div>
          )}
    </div>
  );
}
