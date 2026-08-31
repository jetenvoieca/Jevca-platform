"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type AppShellNavItem = {
  label: string;
  href: string;
  active?: boolean;
  disabled?: boolean;
  badge?: number;
};

// A top-level entry can either be a plain link (existing behaviour) or a
// section — a black header button (2026-08-28 decision, originally just
// "Accounts" grouping Alerts/Subscriptions/Expenses/Account/Consolidated
// Sales) with its own indented children below it. `key` disambiguates
// sections that might otherwise share a label; it defaults to the label
// itself, which is fine as long as labels are unique among sections in
// a given nav.
export type AppShellNavEntry =
  | AppShellNavItem
  | { label: string; section: true; key?: string; children: AppShellNavItem[] };

type SectionEntry = Extract<AppShellNavEntry, { section: true }>;

function isSection(entry: AppShellNavEntry): entry is SectionEntry {
  return "section" in entry;
}

function sectionKey(entry: SectionEntry): string {
  return entry.key ?? entry.label;
}

// Finds the section that contains the currently-active link, so the
// accordion opens on the right group without the caller having to say
// so explicitly — the same `active` flags already used to highlight the
// link do double duty here.
function findActiveSectionKey(entries: AppShellNavEntry[]): string | null {
  for (const entry of entries) {
    if (isSection(entry) && entry.children.some((child) => child.active)) {
      return sectionKey(entry);
    }
  }
  return null;
}

function NavLink({ item, indented }: { item: AppShellNavItem; indented: boolean }) {
  if (item.disabled) {
    return (
      <span
        className={`cursor-not-allowed rounded-md px-3 py-2 text-sm font-medium text-neutral-300 ${
          indented ? "ml-2" : ""
        }`}
      >
        {item.label}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      prefetch={false}
      className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium ${
        indented ? "ml-2" : ""
      } ${item.active ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"}`}
    >
      {item.label}
      {!!item.badge && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
            item.active ? "bg-white/20 text-white" : "bg-red-100 text-red-700"
          }`}
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
}

export default function SidebarNav({ entries }: { entries: AppShellNavEntry[] }) {
  const pathname = usePathname();
  const [openKey, setOpenKey] = useState<string | null>(() => findActiveSectionKey(entries));

  // Keeps the open section following the current page across
  // client-side navigations. A manual header click is handled directly
  // in the click handler below and isn't affected by this — it only
  // re-runs when the pathname itself changes.
  useEffect(() => {
    setOpenKey(findActiveSectionKey(entries));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {entries.map((entry) => {
        if (isSection(entry)) {
          const key = sectionKey(entry);
          const isOpen = openKey === key;
          return (
            <div key={key} className="mb-2">
              <button
                type="button"
                onClick={() => setOpenKey(isOpen ? null : key)}
                aria-expanded={isOpen}
                className="w-full rounded-md bg-[#5E5E5E] px-3 py-1 text-left text-sm font-medium text-white hover:bg-[#525252]"
              >
                {entry.label}
              </button>
              {isOpen && (
                <div className="mt-1 flex flex-col gap-1">
                  {entry.children.map((child) => (
                    <NavLink key={child.href} item={child} indented />
                  ))}
                </div>
              )}
            </div>
          );
        }
        return <NavLink key={entry.href} item={entry} indented={false} />;
      })}
    </>
  );
}
