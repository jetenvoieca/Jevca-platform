"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import StatusSelect from "@/components/StatusSelect";
import { updateSite } from "@/lib/actions";
import {
  toSiteFormFields,
  buildSiteFormData,
  type SiteFormFields,
  type SiteRecord,
} from "@/lib/clientPanelTypes";

const labelCls = "mb-1 block text-xs text-neutral-500";
const inputCls =
  "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:opacity-50";
const cardCls = "rounded-lg border border-neutral-200 bg-white p-4";

type Field = "domain" | "domainStatus" | "domainRenewalDate";

// Domain / Site status / Domain renewal — split out of the
// old SiteSettingsPanel (2026-09-12), same reasoning as OwnerCard: this
// card is shared between the per-site "Profile" page and the
// Administration → Clients page. Site status itself stays as
// StatusSelect, unchanged — it's already its own independent action, not
// part of the resubmit-everything updateSite form.
export default function DomainCard({
  site,
  className = "",
}: {
  site: SiteRecord;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [savedField, setSavedField] = useState<Field | null>(null);
  const router = useRouter();

  const flash = (field: Field) => {
    setSavedField(field);
    setTimeout(() => setSavedField(null), 1500);
  };

  const save = (field: Field, value: string) => {
    let changes: Partial<SiteFormFields>;
    switch (field) {
      case "domain":
        changes = { domain: value };
        break;
      case "domainStatus":
        changes = { domainStatus: value };
        break;
      case "domainRenewalDate":
        changes = { domainRenewalDate: value };
        break;
    }
    const fd = buildSiteFormData(toSiteFormFields(site), changes);
    startTransition(async () => {
      await updateSite(site.id, fd);
      router.refresh();
      flash(field);
    });
  };

  return (
    <div className={`${cardCls} ${className}`}>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className={labelCls}>Domain</label>
          <input
            key={`domain-${site.id}`}
            type="text"
            defaultValue={site.domain || ""}
            placeholder="e.g. janedoeartist.com"
            onBlur={(e) => save("domain", e.target.value.trim())}
            disabled={isPending}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Site status</label>
          <StatusSelect siteId={site.id} status={site.status} />
        </div>
      </div>
      {savedField === "domain" && <p className="mt-1 text-xs text-green-600">Saved</p>}

      <div className="mt-4 border-t border-neutral-200 pt-4">
        <div className="rounded-md border border-neutral-200 p-2.5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
            Domain renewal
          </p>
          <label className={labelCls}>Status</label>
          <select
            key={`domain-status-${site.id}`}
            defaultValue={site.domainStatus || ""}
            onChange={(e) => save("domainStatus", e.target.value)}
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
            onChange={(e) => save("domainRenewalDate", e.target.value)}
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
      </div>
    </div>
  );
}
