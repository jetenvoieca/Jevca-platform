"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPage } from "@/lib/actions/pages";

type PageRow = { id: string; title: string; type: string };

export default function SiteNavPanel({
  siteId,
  pages,
}: {
  siteId: string;
  pages: PageRow[];
}) {
  const pathname = usePathname();
  const [adding, setAdding] = useState(false);

  const artworksActive = pathname.startsWith(`/sites/${siteId}/artworks`);

  return (
    <nav className="flex flex-col gap-1 text-sm">
      <Link
        href="/"
        className="rounded-md px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-100"
      >
        Sites
      </Link>

      <div className="ml-2 flex flex-col gap-1 border-l border-neutral-200 py-1 pl-2">
        {pages.map((p) => {
          const active = pathname === `/sites/${siteId}/pages/${p.id}`;
          return (
            <Link
              key={p.id}
              href={`/sites/${siteId}/pages/${p.id}`}
              className={`truncate rounded-md px-3 py-1.5 ${
                active
                  ? "bg-neutral-200 font-medium text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {p.title}
            </Link>
          );
        })}

        {adding ? (
          <form
            action={async (formData) => {
              await createPage(siteId, formData);
              setAdding(false);
            }}
            className="mt-1 flex flex-col gap-1.5 rounded-md border border-neutral-200 p-2"
          >
            <input
              type="text"
              name="title"
              required
              autoFocus
              placeholder="Page title"
              className="rounded border border-neutral-300 px-2 py-1 text-xs"
            />
            <select
              name="type"
              className="rounded border border-neutral-300 px-2 py-1 text-xs"
            >
              <option value="SECTION">Section</option>
              <option value="PRIVATE">Private / Custom</option>
            </select>
            <div className="flex gap-1">
              <button
                type="submit"
                className="flex-1 rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-700"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-md px-3 py-1.5 text-left text-neutral-500 hover:bg-neutral-100"
          >
            + Add New Page
          </button>
        )}
      </div>

      <Link
        href={`/sites/${siteId}/menus`}
        className={`rounded-md px-3 py-2 font-medium ${
          pathname.startsWith(`/sites/${siteId}/menus`)
            ? "bg-neutral-900 text-white"
            : "text-neutral-700 hover:bg-neutral-100"
        }`}
      >
        Menu
      </Link>

      <Link
        href={`/sites/${siteId}/artworks`}
        className={`mt-3 rounded-md px-3 py-2 font-medium ${
          artworksActive ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
        }`}
      >
        Artwork Catalogue
      </Link>

      <span className="cursor-not-allowed rounded-md px-3 py-2 text-neutral-300">
        Image Catalogue (soon)
      </span>
    </nav>
  );
}
