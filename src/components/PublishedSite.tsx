"use client";

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { usePathname } from "next/navigation";
import {
  pageForPath,
  pageImageUrls,
  publishedHomePath,
  type SiteSnapshot,
  type SnapshotPage,
} from "@/lib/siteSnapshot";
import { SnapshotSiteData } from "@/lib/siteData";
import PagePreview from "@/components/PagePreview";
import PublishedSiteMenu from "@/components/PublishedSiteMenu";

// How long the old page takes to fade out as the new one fades in —
// matches the page-fade animations in tailwind.config.ts.
const FADE_MS = 800;

// A page fading out: where the window was scrolled when it left, so it
// fades where it was while the new page starts at the top.
type Leaving = { page: SnapshotPage; scrollY: number };

// A published site (2026-10-06; 2026-10-13 instant pages): drawn from its
// snapshot with the same components as the admin preview (PagePreview),
// with the site's menu (PublishedSiteMenu). It's loaded once, by the
// site's layout, when a visitor arrives; after that, following a link to
// another of the site's pages (the menu, a Logo…) changes the address
// and draws that page in the browser — no trip to the server; hovering
// over the link first fetches that page's pictures. The old
// page fades out as the new one fades in (Craig's choice: a plain
// cross-fade, 0.8 s), the menu staying where it is. Back and forward
// work as usual, and every address still opens its page directly.
// `siteKey` (2026-10-10): the robot check's public key for this address,
// for the visitor's forms; `salesEnabled` (2026-10-19): whether works can
// be bought online.
export default function PublishedSite({
  siteId,
  siteKey,
  salesEnabled,
  snapshot,
}: {
  siteId: string;
  siteKey: string | null;
  salesEnabled: boolean;
  snapshot: SiteSnapshot;
}) {
  const pathname = usePathname();
  const page = pageForPath(siteId, snapshot.pages, pathname);
  const [leaving, setLeaving] = useState<Leaving[]>([]);
  const previous = useRef<SnapshotPage | null>(page);
  // Whether a page has changed since the visitor arrived — the first
  // page appears without fading in.
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    document.title = page ? `${page.title} — ${snapshot.siteName}` : snapshot.siteName;
  }, [page, snapshot.siteName]);

  // A new page: the one before fades out where it was, and the new one
  // starts at the top.
  useEffect(() => {
    const before = previous.current;
    previous.current = page;
    if (!before || before.id === page?.id) return;
    const gone: Leaving = { page: before, scrollY: window.scrollY };
    setChanged(true);
    setLeaving((list) => [...list.filter((l) => l.page.id !== before.id), gone]);
    window.scrollTo(0, 0);
    const timer = window.setTimeout(() => setLeaving((list) => list.filter((l) => l !== gone)), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [page]);

  // The site's page a link goes to, if it goes to one.
  const linkedPage = (target: EventTarget): SnapshotPage | null => {
    const link = (target as Element).closest?.("a");
    if (!link) return null;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return null;
    return pageForPath(siteId, snapshot.pages, url.pathname);
  };

  // Hovering over (or starting to tap) a link to another page fetches
  // that page's pictures, once, so they're ready when it opens.
  const fetched = useRef(new Set<string>());
  const fetchPictures = (e: PointerEvent<HTMLDivElement>) => {
    const next = linkedPage(e.target);
    if (!next || next.id === page?.id || fetched.current.has(next.id)) return;
    fetched.current.add(next.id);
    for (const url of pageImageUrls(snapshot, next)) {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
    }
  };

  // A plain click on a link to another of the site's pages: show it here.
  // Anything else (another site, an email address, a new tab…) is left
  // to the browser.
  const followLink = (e: MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    const link = (e.target as Element).closest("a");
    if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
    const url = new URL(link.href, window.location.href);
    if (!url.pathname.startsWith(publishedHomePath(siteId)) || !linkedPage(link)) return;
    e.preventDefault();
    if (url.pathname !== window.location.pathname) {
      window.history.pushState(null, "", url.pathname);
    }
  };

  // The page being shown, and any still fading out on top of it. Each
  // keeps its key, so a page fading out isn't drawn again from scratch.
  const layers = [
    ...(page ? [{ page, leaving: null as Leaving | null }] : []),
    ...leaving.filter((l) => l.page.id !== page?.id).map((l) => ({ page: l.page, leaving: l })),
  ];

  return (
    <SnapshotSiteData siteId={siteId} siteKey={siteKey} salesEnabled={salesEnabled} snapshot={snapshot}>
      <div onClick={followLink} onPointerOver={fetchPictures}>
        {layers.map(({ page: p, leaving: l }) => {
          const isCanvas = p.style?.type === "CANVAS";
          // A flex column so the page's background fills the whole
          // window, however short the page.
          const base = isCanvas ? "" : "flex min-h-[100dvh] flex-col";
          const className = l
            ? `pointer-events-none fixed inset-x-0 z-10 animate-page-fade-out ${base}`
            : `${base} ${changed ? "animate-page-fade-in" : ""}`;
          return (
            <main
              key={p.id}
              className={className}
              style={l ? { top: -l.scrollY } : undefined}
              aria-hidden={l ? true : undefined}
            >
              <PagePreview pageId={p.id} curationId={p.curationId} style={p.style} fullScreen />
            </main>
          );
        })}
        <PublishedSiteMenu siteId={siteId} pages={snapshot.pages} menus={snapshot.menus} currentId={page?.id ?? null} />
      </div>
    </SnapshotSiteData>
  );
}
