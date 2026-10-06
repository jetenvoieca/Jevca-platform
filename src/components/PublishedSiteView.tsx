"use client";

import { useState } from "react";
import Link from "next/link";
import type { SiteSnapshot } from "@/lib/siteSnapshot";
import { SnapshotSiteData } from "@/lib/siteData";
import PagePreview from "@/components/PagePreview";

// One page of a published site, full screen (2026-10-06), drawn from its
// snapshot with the same components as the admin preview (PagePreview),
// plus the site's menu.
export default function PublishedSiteView({
  siteId,
  snapshot,
  pageId,
}: {
  siteId: string;
  snapshot: SiteSnapshot;
  pageId: string;
}) {
  const page = snapshot.pages.find((p) => p.id === pageId)!;
  const isCanvas = page.style?.type === "CANVAS";

  return (
    <SnapshotSiteData snapshot={snapshot}>
      <main className={isCanvas ? "" : "min-h-[100dvh]"}>
        <PagePreview
          key={page.id}
          pageId={page.id}
          title={page.title}
          curationId={page.curationId}
          style={page.style}
          fullScreen
        />
      </main>
      <SiteMenu siteId={siteId} snapshot={snapshot} currentId={page.id} />
    </SnapshotSiteData>
  );
}

// The site's menu (2026-10-06, from Craig's request): a small tab on the
// right-hand edge, halfway down, that slides the list of Live Pages out
// when hovered or tapped. The first page is the home page. Sits beneath
// any panel opened on the page.
function SiteMenu({
  siteId,
  snapshot,
  currentId,
}: {
  siteId: string;
  snapshot: SiteSnapshot;
  currentId: string;
}) {
  const [open, setOpen] = useState(false);
  const href = (index: number, slug: string) =>
    index === 0 ? `/site-preview/${siteId}` : `/site-preview/${siteId}/${slug}`;

  return (
    <nav
      className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Menu"
        className="rounded-l-md bg-white/90 px-1.5 py-4 text-neutral-700 shadow-md backdrop-blur hover:text-neutral-900"
      >
        <span className="block text-xs tracking-widest [writing-mode:vertical-rl]">MENU</span>
      </button>
      <div
        className="overflow-hidden bg-white/95 shadow-md backdrop-blur transition-[max-width] duration-300 ease-out"
        style={{ maxWidth: open ? 260 : 0 }}
      >
        <ul className="flex w-[220px] flex-col gap-1 p-3">
          {snapshot.pages.map((p, i) => (
            <li key={p.id}>
              <Link
                href={href(i, p.slug)}
                onClick={() => setOpen(false)}
                className={`block truncate rounded px-2 py-1.5 text-sm ${
                  p.id === currentId
                    ? "bg-neutral-100 text-neutral-900"
                    : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                }`}
              >
                {p.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
