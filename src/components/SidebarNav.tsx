"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type AppShellNavItem = {
  label: string;
  href: string;
  active?: boolean;
  disabled?: boolean;
  badge?: number;
  // A further-indented, lighter-weight sub-link — e.g. a "Settings" or
  // "Bucket" page nested beneath its parent catalogue link within the
  // same section. Rendered smaller, with a soft grey active state
  // instead of the black used for normal section children, so it reads
  // as a level below them rather than a peer.
  subtle?: boolean;
};

// A top-level entry can either be a plain link (existing behaviour) or a
// section — a black header button (2026-08-28 decision, originally just
// "Accounts" grouping Alerts/Subscriptions/Expenses/Account/Consolidated
// Sales) with its own indented children below it. `key` disambiguates
// sections that might otherwise share a label; it defaults to the label
// itself, which is fine as long as labels are unique among sections in
// a given nav.
//
// A section's body is usually just a flat list of links (`children`),
// which this component renders and lays out itself. Occasionally a
// section needs something richer than a link list — e.g. the Sites
// section's page list, with per-page visibility toggles and an inline
// "add page" form — for that, a caller supplies pre-built `customChildren`
// instead, and must also say explicitly whether the section `active`
// (since there are no child `.active` flags for this component to
// infer it from).
export type AppShellNavEntry =
  | AppShellNavItem
  | {
      label: string;
      section: true;
      key?: string;
      active?: boolean;
      children: AppShellNavItem[];
    }
  | {
      label: string;
      section: true;
      key?: string;
      active: boolean;
      customChildren: ReactNode;
    };

type SectionEntry = Extract<AppShellNavEntry, { section: true }>;

function isSection(entry: AppShellNavEntry): entry is SectionEntry {
  return "section" in entry;
}

function sectionKey(entry: SectionEntry): string {
  return entry.key ?? entry.label;
}

function isSectionActive(entry: SectionEntry): boolean {
  if (entry.active !== undefined) return entry.active;
  return "children" in entry && entry.children.some((child) => child.active);
}

// Finds the section that contains the currently-active link, so the
// accordion opens on the right group without most callers having to say
// so explicitly — the same `active` flags already used to highlight the
// link do double duty here.
function findActiveSectionKey(entries: AppShellNavEntry[]): string | null {
  for (const entry of entries) {
    if (isSection(entry) && isSectionActive(entry)) {
      return sectionKey(entry);
    }
  }
  return null;
}

export function NavLink({ item, indented }: { item: AppShellNavItem; indented: boolean }) {
  if (item.disabled) {
    return (
      <span
        className={`cursor-not-allowed rounded-md px-3 py-2 text-sm font-medium text-neutral-300 ${
          indented ? (item.subtle ? "ml-4" : "ml-2") : ""
        }`}
      >
        {item.label}
      </span>
    );
  }

  if (item.subtle) {
    return (
      <Link
        href={item.href}
        prefetch={false}
        className={`ml-4 rounded-md px-3 py-1.5 text-sm ${
          item.active
            ? "bg-neutral-200 font-medium text-neutral-900"
            : "text-neutral-500 hover:bg-neutral-100"
        }`}
      >
        {item.label}
      </Link>
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

// Standardised sidebar navigation (2026-08-31). Every top-level "black
// button" is a section header: clicking it opens its children and closes
// any other open section, so only one set of sub-items is ever visible
// at once. The open section always tracks the current page — if a link
// inside a section is followed, that section becomes (and stays) the
// one that's open, even though this component itself doesn't unmount
// between route changes (it lives in a persistent layout).
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
                  {"customChildren" in entry
                    ? entry.customChildren
                    : entry.children.map((child) => (
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
