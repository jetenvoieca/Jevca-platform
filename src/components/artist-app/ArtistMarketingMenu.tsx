"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidePanel } from "@/components/artist-app/ArtistAppPanels";
import { artistAppHref } from "@/lib/artistApp";
import { MARKETING_ITEMS } from "@/lib/artistAppMarketing";

// Marketing manager's items in the app's side panel (2026-11-13), the one
// open marked — laid out as the pages list.
export default function ArtistMarketingMenu({ siteId }: { siteId: string }) {
  const pathname = usePathname();
  const base = artistAppHref(siteId, "marketing");
  return (
    <SidePanel>
      <nav className="flex flex-col gap-1.5 pt-12">
        {MARKETING_ITEMS.map((i) => {
          const href = `${base}/${i.key}`;
          const open = pathname === href;
          return (
            <Link
              key={i.key}
              href={href}
              prefetch={false}
              aria-current={open ? "page" : undefined}
              className={`rounded-sm border bg-white px-4 py-2 text-sm text-neutral-800 hover:bg-neutral-50 ${
                open ? "border-neutral-800" : "border-neutral-200"
              }`}
            >
              {i.label}
            </Link>
          );
        })}
      </nav>
    </SidePanel>
  );
}
