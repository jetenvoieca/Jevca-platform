"use client";

import { useEffect, useState } from "react";
import type { MenuStyleLayout } from "@/lib/menuStyleLayout";
import { publishedPagePath } from "@/lib/siteSnapshot";
import { SITE_PHONE_QUERY } from "@/lib/siteBreakpoint";
import MenuView from "@/components/MenuView";

// What the menu needs of each Live Page, in order — the first is the
// home page.
type PublishedMenuPage = {
  id: string;
  title: string;
  slug: string;
  menuStyleId: string | null;
};

// A published site's menu (2026-10-06): drawn once with the site (see
// PublishedSite), so it stays in place as pages change — a Fixed menu
// stays open. Shows the menu chosen for the current page (its own, or else the site's), in its
// Menu Style (see MenuView); the items are the site's Live Pages. A page
// with no menu shows none. Changing to a page with a different menu
// starts that menu closed.
export default function PublishedSiteMenu({
  siteId,
  pages,
  menus,
  currentId,
}: {
  siteId: string;
  pages: PublishedMenuPage[];
  menus: Record<string, MenuStyleLayout>;
  // The page being shown — null on an address that isn't one.
  currentId: string | null;
}) {
  const phone = usePhone();

  const current = pages.find((p) => p.id === currentId);
  const layout = current?.menuStyleId ? menus[current.menuStyleId] : undefined;
  if (!current || !layout) return null;

  const items = pages.map((p, i) => ({
    id: p.id,
    title: p.title,
    href: publishedPagePath(siteId, pages, i),
  }));

  return (
    <MenuView
      key={current.menuStyleId}
      layout={layout}
      items={items}
      currentId={current.id}
      phone={phone}
    />
  );
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
