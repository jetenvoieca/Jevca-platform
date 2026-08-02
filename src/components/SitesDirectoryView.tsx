"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import StatusSelect from "@/components/StatusSelect";
import ArchiveButton from "@/components/ArchiveButton";
import { updateSite, updateArtist } from "@/lib/actions";

type SiteRow = {
  id: string;
  name: string;
  domain: string | null;
  status: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED" | "ISYT";
  createdAt: string;
  defaultCurrency: string;
  template: string;
  domainStatus: string | null;
  domainRenewalDate: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string | null;
  ownerPhone: string | null;
  ownerNotes: string | null;
  ownerSubscriptionAmount: string;
  ownerPaymentMethod: string | null;
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
  const router = useRouter();

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
    field: "name" | "email" | "phone" | "notes" | "subscriptionAmount" | "paymentMethod",
    value: string
  ) => {
    if (!selected) return;
    const fd = new FormData();
    fd.set("name", field === "name" ? value : selected.ownerName);
    fd.set("email", field === "email" ? value : selected.ownerEmail || "");
    fd.set("phone", field === "phone" ? value : selected.ownerPhone || "");
    fd.set("notes", field === "notes" ? value : selected.ownerNotes || "");
    fd.set(
      "subscriptionAmount",
      field === "subscriptionAmount" ? value : selected.ownerSubscriptionAmount
    );
    fd.set("paymentMethod", field === "paymentMethod" ? value : selected.ownerPaymentMethod || "");
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
      navItems={[
        { label: "Sites", href: "/", active: true },
        { label: "Namecheap Sync", href: "/namecheap-sync" },
      ]}
      preview={
        selected ? (
          <div>
            <input
              key={`name-${selected.id}`}
              type="text"
              defaultValue={selected.name}
              onBlur={(e) => e.target.value.trim() && saveSite("name", e.target.value.trim())}
              disabled={isPending}
              className="mb-1 w-full rounded-md border border-transparent px-1 py-0.5 -mx-1 text-lg font-semibold text-neutral-900 hover:border-neutral-300 focus:border-neutral-300 disabled:opacity-50"
            />
            {savedField === "name" && <p className="mb-1 text-xs text-green-600">Saved</p>}

            <label className="mb-1 mt-3 block text-xs uppercase tracking-wide text-neutral-400">
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

                {(savedField === "email" ||
                  savedField === "phone" ||
                  savedField === "notes" ||
                  savedField === "subscriptionAmount" ||
                  savedField === "paymentMethod") && (
                  <p className="text-xs text-green-600">Saved</p>
                )}
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
        ) : (
          <p className="text-sm text-neutral-400">Select a site to preview it here.</p>
        )
      }
      content={
        <div>
          <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Sites</h1>

          <form
            method="get"
            className="mb-4 flex flex-wrap items-center gap-3"
          >
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

          <p className="mb-2 text-xs text-neutral-400">
            {sites.length} site{sites.length === 1 ? "" : "s"}
          </p>

          {sites.length === 0 ? (
            <p className="text-sm text-neutral-500">No sites match.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
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
      }
    />
  );
}
