"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { NavLink } from "@/components/SidebarNav";
import { createPage, publishSite, updatePageVisibility } from "@/lib/actions/pages";
import { buildSiteNavEntries, type SiteNavKey } from "@/lib/siteNav";

type PageRow = { id: string; title: string; type: string; visible: boolean };

// Works out which nav item should be highlighted/open purely from the
// current path — this lives here (rather than each page declaring its
// own key, the way the top-level Accounts pages do) because this shell
// is rendered once from the shared site layout, wrapping every page
// under /sites/[id]/*, rather than being built fresh per page.
// Falls back to "overview" (2026-09-02) rather than null for anything
// that isn't one of the other, more specific routes — in practice
// that's the site's own bare /sites/[id] settings page, and it's what
// makes the site's own section open by default the moment you land on
// a site, instead of every section starting closed.
function resolveActiveKey(pathname: string, siteId: string): SiteNavKey {
  const base = `/sites/${siteId}`;
  if (pathname === `${base}/artworks/settings`) return "artworkSettings";
  if (pathname.startsWith(`${base}/artworks`)) return "artworks";
  if (pathname === `${base}/media/settings`) return "mediaSettings";
  if (pathname === `${base}/bucket`) return "bucket";
  if (pathname.startsWith(`${base}/media`)) return "media";
  if (pathname === `${base}/hopper`) return "hopper";
  if (pathname.startsWith(`${base}/purchases/settings`)) return "purchasesSettings";
  if (pathname.startsWith(`${base}/purchases`)) return "purchases";
  if (pathname.startsWith(`${base}/sales`)) return "sales";
  if (pathname.startsWith(`${base}/customers`)) return "customers";
  if (pathname.startsWith(`${base}/galleries`)) return "galleries";
  if (pathname.startsWith(`${base}/menus`)) return "menu";
  if (pathname.startsWith(`${base}/pages/`)) return "pages";
  return "overview";
}

export default function SiteShell({
  siteId,
  siteLabel,
  pages,
  salesEnabled,
  hopperCount,
  bucketCount,
  artworkNeedsReviewCount,
  mediaNeedsReviewCount,
  alertCount,
  hasUnpublished,
  header,
  children,
}: {
  siteId: string;
  // Label for the site's own nav section — the site's name, with an
  // artist-name fallback resolved by the (server) layout, which has
  // both to hand.
  siteLabel: string;
  pages: PageRow[];
  salesEnabled: boolean;
  hopperCount: number;
  bucketCount: number;
  artworkNeedsReviewCount: number;
  mediaNeedsReviewCount: number;
  alertCount: number;
  hasUnpublished: boolean;
  // The site name / domain header, pinned above the scrolling page
  // content — built by the (server) layout since it needs the site
  // record, passed in ready-made.
  header: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [isPending, startTransition] = useTransition();

  const activeKey = resolveActiveKey(pathname, siteId);
  const menuActive = activeKey === "menu";

  // No "All Sites" link here any more (2026-09-02) — "Sites" itself,
  // one level up, now does that job directly (see siteNav.ts), so
  // having a second way to do the same thing from inside this section
  // was just redundant.
  const siteSectionBody = (
    <>
      <div className="flex flex-col gap-1 border-l border-neutral-200 py-1 pl-2">
        {pages.map((p) => {
          const active = pathname === `/sites/${siteId}/pages/${p.id}`;
          return (
            <div key={p.id} className="flex items-center gap-1">
              <Link
                prefetch={false}
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
              <option value="PAVILION">Pavilion</option>
              {/* Experimental parallel version (2026-08-30) — same data,
                  a simpler flow-layout canvas with no drag/resize, panel
                  closed until you click the pencil. Kept as a separate
                  type entirely so trying it never risks the original. */}
              <option value="PAVILION_VISUAL">Pavilion (Visual)</option>
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

      <NavLink
        item={{ label: "Menu", href: `/sites/${siteId}/menus`, active: menuActive }}
        indented
      />
    </>
  );

  const navItems = buildSiteNavEntries({
    siteId,
    siteLabel,
    active: activeKey,
    alertCount,
    hopperCount,
    bucketCount,
    artworkNeedsReviewCount,
    mediaNeedsReviewCount,
    salesEnabled,
    siteSectionBody,
  });

  return (
    <AppShell
      publishEnabled={hasUnpublished}
      publishAction={publishSite.bind(null, siteId)}
      navItems={navItems}
      content={
        <div className="flex h-full flex-col">
          <div className="shrink-0 border-b border-neutral-200 px-6 py-4">{header}</div>
          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      }
    />
  );
}
