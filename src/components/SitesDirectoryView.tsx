"use client";

import { useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import StatusSelect from "@/components/StatusSelect";
import ArchiveButton from "@/components/ArchiveButton";

type SiteRow = {
  id: string;
  name: string;
  domain: string | null;
  status: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED";
  createdAt: string;
  ownerName: string;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = sites.find((s) => s.id === selectedId) || null;

  return (
    <AppShell
      publishEnabled={false}
      navItems={[{ label: "Sites", href: "/", active: true }]}
      preview={
        selected ? (
          <div>
            <h3 className="mb-1 text-lg font-semibold text-neutral-900">{selected.name}</h3>
            <p className="mb-4 text-sm text-neutral-500">Owner: {selected.ownerName}</p>
            <dl className="mb-6 space-y-2 text-sm">
              <div>
                <dt className="text-neutral-400">Domain</dt>
                <dd className="text-neutral-800">{selected.domain || "—"}</dd>
              </div>
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
              href={`/sites/${selected.id}`}
              className="mb-6 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Open Site →
            </Link>

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
