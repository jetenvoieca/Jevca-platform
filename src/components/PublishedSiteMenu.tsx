"use client";

import { useEffect, useState } from "react";
import type { MenuStyleLayout } from "@/lib/menuStyleLayout";
import type { SiteArtist } from "@/lib/siteArtist";
import { publishedPagePath } from "@/lib/siteSnapshot";
import { SITE_PHONE_QUERY } from "@/lib/siteBreakpoint";
import MenuView, { type MenuViewItem } from "@/components/MenuView";

// What the menu needs of each Live Page, in order — the first is the
// home page.
type PublishedMenuPage = {
  id: string;
  title: string;
  slug: string;
  menuStyleId: string | null;
  parentId: string | null;
};

// A published site's menu (2026-10-06): drawn once with the site (see
// PublishedSite), so it stays in place as pages change — a Fixed menu
// stays open. Shows the menu chosen for the current page (its own, or
// else the site's), in its Menu Style (see MenuView); the items are the
// site's Live Pages, those under another under it (menuTree). A page
// with no menu shows none. Changing to a page with a different menu
// starts that menu closed.
export default function PublishedSiteMenu({
  siteId,
  pages,
  menus,
  artist,
  currentId,
}: {
  siteId: string;
  pages: PublishedMenuPage[];
  menus: Record<string, MenuStyleLayout>;
  // The Logo for a top bar and the links under a Side list (2026-10-23).
  artist: SiteArtist | null;
  // The page being shown — null on an address that isn't one.
  currentId: string | null;
}) {
  const phone = usePhone();

  const current = pages.find((p) => p.id === currentId);
  const layout = current?.menuStyleId ? menus[current.menuStyleId] : undefined;
  if (!current || !layout) return null;

  const items = menuTree(siteId, pages);

  return (
    <MenuView
      key={current.menuStyleId}
      layout={layout}
      items={items}
      currentId={current.id}
      phone={phone}
      artist={
        artist && {
          logoUrl: artist.logoUrl,
          logoByline: artist.logoByline ?? null,
          social: artist.social ?? null,
        }
      }
    />
  );
}

// The Live Pages as the menu lists them (2026-10-25): each page at the
// top, in order, with the pages sitting under it (Page.parentId), in
// order. A page whose page above isn't live is at the top. A page with
// pages under it links to the first of them — it stands for its group
// (e.g. "portfolio" opens its first section).
function menuTree(siteId: string, pages: PublishedMenuPage[]): MenuViewItem[] {
  const ids = new Set(pages.map((p) => p.id));
  const item = (p: PublishedMenuPage): MenuViewItem => ({
    id: p.id,
    title: p.title,
    href: publishedPagePath(siteId, pages, pages.indexOf(p)),
  });
  return pages
    .filter((p) => !p.parentId || !ids.has(p.parentId))
    .map((p) => {
      const children = pages.filter((c) => c.parentId === p.id).map(item);
      const own = item(p);
      return children.length ? { ...own, href: children[0].href, children } : own;
    });
}

// Whether the screen is phone-sized, following changes (e.g. turning a
// tablet). False until measured in the browser.
function usePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(SITE_PHONE_QUERY);
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return phone;
}
