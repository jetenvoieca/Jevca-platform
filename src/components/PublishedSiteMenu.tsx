"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { MenuStyleLayout } from "@/lib/menuStyleLayout";
import MenuView from "@/components/MenuView";

// What the menu needs of each Live Page, in order — the first is the
// home page.
export type PublishedMenuPage = {
  id: string;
  title: string;
  slug: string;
  menuStyleId: string | null;
};

// Phones are narrower than this (Tailwind's md), as everywhere else.
const PHONE_QUERY = "(max-width: 767px)";

// A published site's menu (2026-10-06): drawn by the site's layout, so it
// stays in place as pages change — a Fixed menu stays open. Shows the
// menu chosen for the current page (its own, or else the site's), in its
// Menu Style (see MenuView); the items are the site's Live Pages. A page
// with no menu shows none. Changing to a page with a different menu
// starts that menu closed.
export default function PublishedSiteMenu({
  siteId,
  pages,
  menus,
}: {
  siteId: string;
  pages: PublishedMenuPage[];
  menus: Record<string, MenuStyleLayout>;
}) {
  const pathname = usePathname();
  const phone = usePhone();

  const base = `/site-preview/${siteId}`;
  const slug = pathname.startsWith(`${base}/`) ? decodeURIComponent(pathname.slice(base.length + 1)) : "";
  const current = slug ? pages.find((p) => p.slug === slug) : pages[0];
  const layout = current?.menuStyleId ? menus[current.menuStyleId] : undefined;
  if (!current || !layout) return null;

  const items = pages.map((p, i) => ({
    id: p.id,
    title: p.title,
    href: i === 0 ? base : `${base}/${p.slug}`,
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
    const query = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return phone;
}
