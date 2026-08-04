"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import StatusSelect from "@/components/StatusSelect";
import ArchiveButton from "@/components/ArchiveButton";
import { updateSite, updateArtist, updateSalesEnabled, saveArtistLogo } from "@/lib/actions";
import { requestUploadUrl } from "@/lib/actions/media";

type SiteRow = {
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
  ownerId: string;
  ownerName: string;
  ownerFirstName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  ownerNotes: string | null;
  ownerSubscriptionAmount: string;
  ownerPaymentMethod: string | null;
  ownerLogoUrl: string | null;
  ownerInvoiceAddress: string | null;
  ownerVatNumber: string | null;
  ownerVatRate: string;
  ownerInvoiceFooterText: string | null;
  ownerNextInvoiceNumber: number;
};

export default function SitesDirectoryView({
  sites,
  q,
  sort,
  showArchived,
  initialSelectedId = null,
}: {
  sites: SiteRow[];
  q: string;
  sort: string;
  showArchived: boolean;
  initialSelectedId?: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const selected = sites.find((s) => s.id === selectedId) || null;
  const [isPending, startTransition] = useTransition();
  const [savedField, setSavedField] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const router = useRouter();

  const handleLogoUpload = async (file: File) => {
    if (!selected) return;
    setLogoUploading(true);
    try {
      const result = await requestUploadUrl(selected.ownerId, file.name, file.type);
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
      await saveArtistLogo(selected.ownerId, result.key);
      router.refresh();
    } finally {
      setLogoUploading(false);
    }
  };

  const saveSite = (
    field: "name" | "domain" | "defaultCurrency" | "template" | "domainStatus" | "domainRenewalDate",
    value: string
  ) => {
    if (!selected) return;
    const fd = new FormData();
    fd.set("name", field === "name" ? value : selected.name);
    fd.set("domain", field === "domain" ? value : selected.domain || "");
    fd.set("defaultCurrency", field === "defaultCurrency" ? value : selected.defaultCurrency);
    fd.set("template", field === "template" ? value : selected.template);
    fd.set("domainStatus", field === "domainStatus" ? value : selected.domainStatus || "");
    fd.set(
      "domainRenewalDate",
      field === "domainRenewalDate" ? value : selected.domainRenewalDate
    );
    startTransition(async () => {
      await updateSite(selected.id, fd);
      router.refresh();
      setSavedField(field);
      setTimeout(() => setSavedField(null), 1500);
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
      | "paymentMethod"
      | "invoiceAddress"
      | "vatNumber"
      | "vatRate"
      | "invoiceFooterText"
      | "nextInvoiceNumber",
    value: string
  ) => {
    if (!selected) return;
    const fd = new FormData();
    fd.set("name", field === "name" ? value : selected.ownerName);
    fd.set("firstName", field === "firstName" ? value : selected.ownerFirstName || "");
    fd.set("email", field === "email" ? value : selected.ownerEmail || "");
    fd.set("phone", field === "phone" ? value : selected.ownerPhone || "");
    fd.set("notes", field === "notes" ? value : selected.ownerNotes || "");
    fd.set(
      "subscriptionAmount",
      field === "subscriptionAmount" ? value : selected.ownerSubscriptionAmount
    );
    fd.set("paymentMethod", field === "paymentMethod" ? value : selected.ownerPaymentMethod || "");
    fd.set(
      "invoiceAddress",
      field === "invoiceAddress" ? value : selected.ownerInvoiceAddress || ""
    );
    fd.set("vatNumber", field === "vatNumber" ? value : selected.ownerVatNumber || "");
    fd.set("vatRate", field === "vatRate" ? value : selected.ownerVatRate || "");
    fd.set(
      "invoiceFooterText",
      field === "invoiceFooterText" ? value : selected.ownerInvoiceFooterText || ""
    );
    // Deliberately NOT always sent — only when this field is the one
    // actually being edited, so every other unrelated save (email, notes,
    // etc.) never accidentally resets the invoice counter back to its
    // current value mid-sequence.
    if (field === "nextInvoiceNumber") fd.set("nextInvoiceNumber", value);
    startTransition(async () => {
      await updateArtist(selected.ownerId, fd);
      router.refresh();
      setSavedField(field);
      setTimeout(() => setSavedField(null), 1500);
    });
  };

  return (
    <AppShell
      publishEnabled={false}
      navItems={[{ label: "Sites", href: "/", active: true }]}
      preview={
        selected ? (
          <div className="flex h-full flex-col">
            <div className="border-b border-neutral-200 bg-neutral-50 px-6 py-4">
              <input
                key={`name-${selected.id}`}
                type="text"
                defaultValue={selected.name}
                onBlur={(e) => e.target.value.trim() && saveSite("name", e.target.value.trim())}
                disabled={isPending}
                className="w-full rounded-md border border-transparent px-1 py-0.5 -mx-1 text-lg font-semibold text-neutral-900 hover:border-neutral-300 focus:border-neutral-300 disabled:opacity-50"
              />
              {savedField === "name" && <p className="mt-1 text-xs text-green-600">Saved</p>}
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
            <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">
              Domain
            </label>
            <input
              key={`domain-${selected.id}`}
              type="text"
              defaultValue={selected.domain || ""}
              placeholder="e.g. janedoeartist.com"
              onBlur={(e) => saveSite("domain", e.target.value.trim())}
              disabled={isPending}
              className="mb-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
            />
            {savedField === "domain" && <p className="text-xs text-green-600">Saved</p>}

            <div className="mb-1 mt-3 rounded-md border border-neutral-200 p-2">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                Domain renewal
              </p>
              <label className="mb-1 block text-xs text-neutral-500">Status</label>
              <select
                key={`domain-status-${selected.id}`}
                defaultValue={selected.domainStatus || ""}
                onChange={(e) => saveSite("domainStatus", e.target.value)}
                disabled={isPending}
                className="mb-2 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
              >
                <option value="">— Not checked —</option>
                <option value="Active">Active</option>
                <option value="Expiring soon">Expiring soon</option>
                <option value="Expired">Expired</option>
              </select>

              <label className="mb-1 block text-xs text-neutral-500">Renewal date</label>
              <input
                key={`domain-renewal-date-${selected.id}`}
                type="date"
                defaultValue={selected.domainRenewalDate}
                onChange={(e) => saveSite("domainRenewalDate", e.target.value)}
                disabled={isPending}
                className="mb-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
              />

              {(savedField === "domainStatus" || savedField === "domainRenewalDate") && (
                <p className="mt-1 text-xs text-green-600">Saved</p>
              )}
              <p className="mt-2 text-xs text-neutral-400">
                Editable here, or updated in bulk via Namecheap Sync.
              </p>
            </div>

            <label className="mb-1 mt-3 block text-xs uppercase tracking-wide text-neutral-400">
              Default currency
            </label>
            <select
              key={`currency-${selected.id}`}
              defaultValue={selected.defaultCurrency}
              onChange={(e) => saveSite("defaultCurrency", e.target.value)}
              disabled={isPending}
              className="mb-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
            >
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
            </select>
            {savedField === "defaultCurrency" && <p className="text-xs text-green-600">Saved</p>}

            <label className="mb-1 mt-3 block text-xs uppercase tracking-wide text-neutral-400">
              Template
            </label>
            <select
              key={`template-${selected.id}`}
              defaultValue={selected.template}
              onChange={(e) => saveSite("template", e.target.value)}
              disabled={isPending}
              className="mb-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
            >
              <option value="Default">Default</option>
            </select>
            {savedField === "template" && <p className="text-xs text-green-600">Saved</p>}
            <p className="mb-1 text-xs text-neutral-400">
              Place-marker for when multiple public-site templates exist — not wired to anything
              yet.
            </p>

            <label className="mt-3 flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={selected.salesEnabled}
                disabled={isPending}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  startTransition(async () => {
                    await updateSalesEnabled(selected.id, enabled);
                    router.refresh();
                  });
                }}
              />
              Show &quot;Sales&quot; menu on this site
            </label>
            <p className="mb-1 text-xs text-neutral-400">
              Off by default — only needed for sites that actually sell, not portfolio-only ones.
            </p>

            <dl className="my-4 space-y-2 text-sm">
              <div>
                <dt className="text-neutral-400">Status</dt>
                <dd className="text-neutral-800">{selected.status}</dd>
              </div>
              <div>
                <dt className="text-neutral-400">Created</dt>
                <dd className="text-neutral-800">
                  {new Date(selected.createdAt).toLocaleDateString()}
                </dd>
              </div>
            </dl>

            <Link
              href={`/sites/${selected.id}/open`}
              className="mb-6 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Open Site →
            </Link>

            <div className="mb-6 border-t border-neutral-200 pt-4">
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                Owner
              </h4>
              <div className="space-y-2">
                <input
                  key={`owner-name-${selected.ownerId}`}
                  type="text"
                  defaultValue={selected.ownerName}
                  onBlur={(e) =>
                    e.target.value.trim() && saveOwner("name", e.target.value.trim())
                  }
                  disabled={isPending}
                  placeholder="Name"
                  className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                />
                <input
                  key={`owner-firstname-${selected.ownerId}`}
                  type="text"
                  defaultValue={selected.ownerFirstName || ""}
                  onBlur={(e) => saveOwner("firstName", e.target.value.trim())}
                  disabled={isPending}
                  placeholder="First name (for personalised emails)"
                  className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                />
                <input
                  key={`owner-email-${selected.ownerId}`}
                  type="email"
                  defaultValue={selected.ownerEmail || ""}
                  onBlur={(e) => saveOwner("email", e.target.value.trim())}
                  disabled={isPending}
                  placeholder="Email"
                  className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                />
                <input
                  key={`owner-phone-${selected.ownerId}`}
                  type="text"
                  defaultValue={selected.ownerPhone || ""}
                  onBlur={(e) => saveOwner("phone", e.target.value.trim())}
                  disabled={isPending}
                  placeholder="Phone"
                  className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                />
                <textarea
                  key={`owner-notes-${selected.ownerId}`}
                  defaultValue={selected.ownerNotes || ""}
                  onBlur={(e) => saveOwner("notes", e.target.value.trim())}
                  disabled={isPending}
                  placeholder="Notes"
                  rows={2}
                  className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                />

                <label className="mb-1 mt-2 block text-xs uppercase tracking-wide text-neutral-400">
                  Subscription £
                </label>
                <input
                  key={`owner-subscription-${selected.ownerId}`}
                  type="text"
                  inputMode="decimal"
                  defaultValue={selected.ownerSubscriptionAmount}
                  onBlur={(e) => saveOwner("subscriptionAmount", e.target.value.trim())}
                  disabled={isPending}
                  placeholder="e.g. 25.00"
                  className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                />

                <label className="mb-1 mt-2 block text-xs uppercase tracking-wide text-neutral-400">
                  Payment
                </label>
                <select
                  key={`owner-payment-${selected.ownerId}`}
                  defaultValue={selected.ownerPaymentMethod || ""}
                  onChange={(e) => saveOwner("paymentMethod", e.target.value)}
                  disabled={isPending}
                  className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                >
                  <option value="">—</option>
                  <option value="Stripe">Stripe</option>
                  <option value="PayPal">PayPal</option>
                  <option value="DD">DD</option>
                </select>

                {(savedField === "firstName" ||
                  savedField === "email" ||
                  savedField === "phone" ||
                  savedField === "notes" ||
                  savedField === "subscriptionAmount" ||
                  savedField === "paymentMethod") && (
                  <p className="text-xs text-green-600">Saved</p>
                )}

                <div className="mt-4 rounded-md border border-neutral-200 p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                    Invoicing
                  </p>

                  <label className="mb-1 block text-xs text-neutral-500">Logo</label>
                  <div className="mb-2 flex items-center gap-2">
                    {selected.ownerLogoUrl ? (
                      <img
                        src={selected.ownerLogoUrl}
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

                  <label className="mb-1 block text-xs text-neutral-500">
                    Artist address (for invoices)
                  </label>
                  <textarea
                    key={`owner-invoice-address-${selected.ownerId}`}
                    defaultValue={selected.ownerInvoiceAddress || ""}
                    onBlur={(e) => saveOwner("invoiceAddress", e.target.value.trim())}
                    disabled={isPending}
                    rows={2}
                    className="mb-2 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                  />

                  <div className="mb-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-neutral-500">VAT number</label>
                      <input
                        key={`owner-vat-number-${selected.ownerId}`}
                        type="text"
                        defaultValue={selected.ownerVatNumber || ""}
                        onBlur={(e) => saveOwner("vatNumber", e.target.value.trim())}
                        disabled={isPending}
                        placeholder="Blank = not VAT registered"
                        className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-neutral-500">VAT rate %</label>
                      <input
                        key={`owner-vat-rate-${selected.ownerId}`}
                        type="text"
                        inputMode="decimal"
                        defaultValue={selected.ownerVatRate}
                        onBlur={(e) => saveOwner("vatRate", e.target.value.trim())}
                        disabled={isPending}
                        placeholder="e.g. 20"
                        className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <label className="mb-1 block text-xs text-neutral-500">
                    Invoice footer text
                  </label>
                  <textarea
                    key={`owner-invoice-footer-${selected.ownerId}`}
                    defaultValue={selected.ownerInvoiceFooterText || ""}
                    onBlur={(e) => saveOwner("invoiceFooterText", e.target.value.trim())}
                    disabled={isPending}
                    placeholder="e.g. VAT exemption note, bank details, thank-you message…"
                    rows={3}
                    className="mb-2 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                  />

                  <label className="mb-1 block text-xs text-neutral-500">
                    Next invoice number
                  </label>
                  <input
                    key={`owner-next-invoice-${selected.ownerId}`}
                    type="number"
                    defaultValue={selected.ownerNextInvoiceNumber}
                    onBlur={(e) => e.target.value.trim() && saveOwner("nextInvoiceNumber", e.target.value.trim())}
                    disabled={isPending}
                    className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                  />
                  <p className="mt-1 text-xs text-neutral-400">
                    Set once as a starting point — increments automatically after that each time an
                    invoice is actually generated.
                  </p>

                  {(savedField === "invoiceAddress" ||
                    savedField === "vatNumber" ||
                    savedField === "vatRate" ||
                    savedField === "invoiceFooterText" ||
                    savedField === "nextInvoiceNumber") && (
                    <p className="text-xs text-green-600">Saved</p>
                  )}
                </div>
              </div>
            </div>

            {/* Homepage preview — placeholder until the public-facing page
                renderer exists; this fills in once pages are built properly. */}
            <div className="overflow-hidden rounded-lg border border-neutral-300 bg-white">
              <div className="border-b border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-400">
                Home page
              </div>
              <div className="flex h-40 items-center justify-center text-xs text-neutral-300">
                Preview coming soon
              </div>
            </div>
            </div>
          </div>
        ) : (
          <p className="p-6 text-sm text-neutral-400">Select a site to preview it here.</p>
        )
      }
      content={
        <div className="flex h-full flex-col">
          <div className="border-b border-neutral-200 px-6 pb-4 pt-6">
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-2xl font-semibold text-neutral-900">Sites</h1>
              <Link
                href="/namecheap-sync"
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
              >
                Namecheap Sync
              </Link>
            </div>

            <form method="get" className="mb-4 flex flex-wrap items-center gap-3">
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Search by owner or site name"
                className="w-56 rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <select
                name="sort"
                defaultValue={sort}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="owner">Sort: Owner</option>
                <option value="date">Sort: Date created</option>
              </select>
              {showArchived && <input type="hidden" name="archived" value="1" />}
              <button
                type="submit"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
              >
                Apply
              </button>

              <label className="flex items-center gap-2 text-sm text-neutral-600">
                <input
                  type="checkbox"
                  name="archived"
                  value="1"
                  defaultChecked={showArchived}
                  onChange={(e) => e.currentTarget.form?.requestSubmit()}
                />
                Show archived
              </label>

              <Link
                href="/sites/new"
                className="ml-auto rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
              >
                + Add New Site
              </Link>
            </form>

            <p className="text-xs text-neutral-400">
              {sites.length} site{sites.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {sites.length === 0 ? (
              <p className="pt-4 text-sm text-neutral-500">No sites match.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="border-b border-neutral-200 text-left text-neutral-500">
                    <th className="py-2 font-medium">Owner</th>
                    <th className="py-2 font-medium">Site name</th>
                    <th className="py-2 font-medium">Domain</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 font-medium">Created</th>
                    <th className="py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => (
                    <tr
                      key={site.id}
                      onClick={() => setSelectedId(site.id)}
                      className={`cursor-pointer border-b border-neutral-100 ${
                        selectedId === site.id ? "bg-neutral-100" : "hover:bg-neutral-50"
                      }`}
                    >
                      <td className="py-3">{site.ownerName}</td>
                      <td className="py-3 font-medium text-neutral-900">{site.name}</td>
                      <td className="py-3 text-neutral-500">{site.domain || "—"}</td>
                      <td className="py-3" onClick={(e) => e.stopPropagation()}>
                        {site.status === "ARCHIVED" ? (
                          <span className="text-neutral-400">Archived</span>
                        ) : (
                          <StatusSelect siteId={site.id} status={site.status} />
                        )}
                      </td>
                      <td className="py-3 text-neutral-500">
                        {new Date(site.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <ArchiveButton siteId={site.id} isArchived={site.status === "ARCHIVED"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      }
    />
  );
}
