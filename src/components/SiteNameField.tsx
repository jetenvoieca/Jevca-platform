"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSite } from "@/lib/actions";

// Lives in the persistent per-site header (layout.tsx) rather than inside
// the Settings page's own panel — moved here 2026-08-18, direct request,
// after a duplicate header (site name + owner shown twice: once here,
// once again inside Settings) was flagged. This is now the only place a
// site can be renamed; Settings itself no longer has its own copy of
// this field.
//
// updateSite (the underlying Server Action) saves the site's editable
// fields together as one form, not name in isolation — so this still
// sends the site's current domain/currency/template/etc. unchanged
// alongside the new name, same as Settings' own save always did.
export default function SiteNameField({
  site,
  ownerName,
}: {
  site: {
    id: string;
    name: string;
    domain: string | null;
    defaultCurrency: string;
    template: string;
    domainStatus: string | null;
    domainRenewalDate: Date | null;
  };
  ownerName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const handleBlur = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === site.name) return;
    const fd = new FormData();
    fd.set("name", trimmed);
    fd.set("domain", site.domain || "");
    fd.set("defaultCurrency", site.defaultCurrency);
    fd.set("template", site.template);
    fd.set("domainStatus", site.domainStatus || "");
    fd.set(
      "domainRenewalDate",
      site.domainRenewalDate ? site.domainRenewalDate.toISOString().slice(0, 10) : ""
    );
    startTransition(async () => {
      await updateSite(site.id, fd);
      router.refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  return (
    <div className="min-w-0 flex-1">
      <input
        key={`name-${site.id}`}
        type="text"
        defaultValue={site.name}
        onBlur={(e) => handleBlur(e.target.value)}
        disabled={isPending}
        className="w-full max-w-md rounded-md border border-transparent px-1 py-0.5 -mx-1 text-xl font-semibold text-neutral-900 hover:border-neutral-300 focus:border-neutral-300 disabled:opacity-50"
      />
      <p className="mt-1 px-1 text-sm text-neutral-500">Owner: {ownerName}</p>
      {saved && <p className="px-1 text-xs text-green-600">Saved</p>}
    </div>
  );
}
