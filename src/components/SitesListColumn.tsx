"use client";

import Link from "next/link";

type SiteRow = {
  id: string;
  name: string;
  status: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED" | "ISYT";
  ownerName: string;
};

export default function SitesListColumn({
  sites,
  q,
  sort,
  showArchived,
  selectedId = null,
}: {
  sites: SiteRow[];
  q: string;
  sort: string;
  showArchived: boolean;
  selectedId?: string | null;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 px-4 pb-3 pt-4">
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Sites</h2>
        {/* Always posts to "/" — searching or sorting from within a
            selected site's settings page takes you to the full list view
            to see the results, same as clicking a row would. */}
        <form method="get" action="/" className="flex flex-col gap-1.5">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search owner or site"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
          />
          <div className="flex items-center gap-1.5">
            <select
              name="sort"
              defaultValue={sort}
              className="flex-1 rounded-md border border-neutral-300 px-1.5 py-1 text-xs"
            >
              <option value="owner">Sort: Owner</option>
              <option value="date">Sort: Date</option>
            </select>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
            >
              Go
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-neutral-600">
            <input
              type="checkbox"
              name="archived"
              value="1"
              defaultChecked={showArchived}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
            Show archived
          </label>
        </form>
        <p className="mt-2 text-[11px] text-neutral-400">
          {sites.length} site{sites.length === 1 ? "" : "s"}
        </p>
        <Link
          href="/sites/new"
          className="mt-2 block rounded-md bg-neutral-900 px-2 py-1.5 text-center text-xs font-medium text-white hover:bg-neutral-700"
        >
          + Add New Site
        </Link>
        <Link
          href="/namecheap-sync"
          className="mt-1.5 block rounded-md border border-neutral-300 px-2 py-1.5 text-center text-xs text-neutral-600 hover:bg-neutral-50"
        >
          Namecheap Sync
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sites.length === 0 ? (
          <p className="p-4 text-xs text-neutral-500">No sites match.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {sites.map((site) => {
              const active = site.id === selectedId;
              return (
                <li key={site.id}>
                  <Link
                    href={`/sites/${site.id}`}
                    prefetch={false}
                    className={`flex items-center justify-between gap-2 px-4 py-2 text-xs ${
                      active
                        ? "bg-neutral-900 text-white"
                        : "text-neutral-800 hover:bg-neutral-50"
                    }`}
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{site.ownerName}</span>
                      {site.name !== site.ownerName && (
                        <span className={active ? "text-neutral-300" : "text-neutral-400"}>
                          {" "}
                          — {site.name}
                        </span>
                      )}
                    </span>
                    {site.status === "ARCHIVED" && (
                      <span
                        className={`shrink-0 text-[10px] ${
                          active ? "text-neutral-300" : "text-neutral-400"
                        }`}
                      >
                        Archived
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
