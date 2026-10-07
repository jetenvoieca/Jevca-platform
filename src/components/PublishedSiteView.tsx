"use client";

import type { SiteSnapshot } from "@/lib/siteSnapshot";
import { SnapshotSiteData } from "@/lib/siteData";
import PagePreview from "@/components/PagePreview";

// One page of a published site, full screen (2026-10-06), drawn from its
// snapshot with the same components as the admin preview (PagePreview).
// The site's menu is drawn around it by the site's layout (see
// PublishedSiteMenu), so it stays in place from page to page.
export default function PublishedSiteView({
  snapshot,
  pageId,
}: {
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
          curationId={page.curationId}
          style={page.style}
          fullScreen
        />
      </main>
    </SnapshotSiteData>
  );
}
