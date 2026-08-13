"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";

type SiteRow = {
  id: string;
  name: string;
  status: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED" | "ISYT";
  ownerName: string;
};

const STATUS_LABELS: Record<SiteRow["status"], string> = {
  DRAFT: "Draft",
  LIVE: "Live",
  PAUSED: "Paused",
  ARCHIVED: "Archived",
  ISYT: "ISYT",
};

export default function SitesDirectoryView({
  sites,
  q,
  sort,
  showArchived,
}: {
  sites: SiteRow[];
  q: string;
  sort: string;
  showArchived: boolean;
}) {
  return (
    <AppShell
      publishEnabled={false}
      navItems={[{ label: "Sites", href: "/", active: true }]}
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

            <form method="get" className="mb-3 flex flex-wrap items-center gap-3">
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Search by owner or site name"
                className="w-64 rounded-md border border-neutral-300 px-3 py-2 text-sm"
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

          <div className="flex-1 overflow-y-auto">
            {sites.length === 0 ? (
              <p className="p-6 text-sm text-neutral-500">No sites match.</p>
            ) : (
              // Deliberately minimal — one line per site, name only
              // (2026-08-13 decision). Everything else (domain, status,
              // archive, owner contact details…) lives one click away on
              // the site's own settings page, not repeated here.
              <ul className="mx-auto max-w-xl divide-y divide-neutral-100 px-6">
                {sites.map((site) => (
                  <li key={site.id}>
                    <Link
                      href={`/sites/${site.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm hover:bg-neutral-50"
                    >
                      <span className="truncate">
                        <span className="font-medium text-neutral-900">{site.ownerName}</span>
                        {site.name !== site.ownerName && (
                          <span className="text-neutral-400"> — {site.name}</span>
                        )}
                      </span>
                      {site.status === "ARCHIVED" && (
                        <span className="shrink-0 text-xs text-neutral-400">
                          {STATUS_LABELS[site.status]}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      }
    />
  );
}
