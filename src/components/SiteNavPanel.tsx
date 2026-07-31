"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createPage, updatePageVisibility } from "@/lib/actions/pages";

type PageRow = { id: string; title: string; type: string; visible: boolean };

export default function SiteNavPanel({
  siteId,
  pages,
}: {
  siteId: string;
  pages: PageRow[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [isPending, startTransition] = useTransition();

  const artworkSettingsActive = pathname === `/sites/${siteId}/artworks/settings`;
  const artworksActive =
    pathname.startsWith(`/sites/${siteId}/artworks`) && !artworkSettingsActive;

  const mediaSettingsActive = pathname === `/sites/${siteId}/media/settings`;
  const mediaActive = pathname.startsWith(`/sites/${siteId}/media`) && !mediaSettingsActive;

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
            <div key={p.id} className="flex items-center gap-1">
              <Link
                href={`/sites/${siteId}/pages/${p.id}`}
                className={`flex-1 truncate rounded-md px-3 py-1.5 ${
                  active
                    ? "bg-neutral-200 font-medium text-neutral-900"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {p.title}
              </Link>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await updatePageVisibility(p.id, siteId, !p.visible);
                    router.refresh();
                  })
                }
                title={
                  p.visible
                    ? "Visible — click to hide while you build/edit it"
                    : "Hidden — building in readiness, click to make visible"
                }
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  p.visible
                    ? "bg-green-100 text-green-700"
                    : "bg-neutral-200 text-neutral-500"
                }`}
              >
                {p.visible ? "Visible" : "Hidden"}
              </button>
            </div>
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
      <Link
        href={`/sites/${siteId}/artworks/settings`}
        className={`ml-2 rounded-md px-3 py-1.5 text-sm ${
          artworkSettingsActive
            ? "bg-neutral-200 font-medium text-neutral-900"
            : "text-neutral-500 hover:bg-neutral-100"
        }`}
      >
        Settings
      </Link>

      <Link
        href={`/sites/${siteId}/media`}
        className={`mt-3 rounded-md px-3 py-2 font-medium ${
          mediaActive ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
        }`}
      >
        Media Catalogue
      </Link>
      <Link
        href={`/sites/${siteId}/media/settings`}
        className={`ml-2 rounded-md px-3 py-1.5 text-sm ${
          mediaSettingsActive
            ? "bg-neutral-200 font-medium text-neutral-900"
            : "text-neutral-500 hover:bg-neutral-100"
        }`}
      >
        Settings
      </Link>
    </nav>
  );
}
