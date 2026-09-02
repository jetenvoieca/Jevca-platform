"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Default section-header colour — grey, used for Administration/Sites
// and anywhere else a caller doesn't specify one. The per-site menu
// (siteNav.ts) overrides this to a distinct purple for the sections
// that belong to the specific site you're inside, 2026-09-02.
const DEFAULT_SECTION_COLOR = "#5E5E5E";

export type AppShellNavItem = {
  label: string;
  href: string;
  active?: boolean;
  disabled?: boolean;
  badge?: number;
  // A further-indented, lighter-weight sub-link — e.g. a "Settings" or
  // "Bucket" page nested beneath its parent catalogue link within the
  // same section. Rendered smaller, with the same light-grey active
  // state as a normal link, just further indented and lighter-weight,
  // so it reads as a level below them rather than a peer.
  subtle?: boolean;
};

// A top-level entry can either be a plain link or a section — a header
// button (2026-08-28 decision, originally just "Accounts" grouping
// Alerts/Subscriptions/Expenses/Account/Consolidated Sales) with its
// own indented children below it. `key` disambiguates sections that
// might otherwise share a label; it defaults to the label itself,
// which is fine as long as labels are unique among sections in a given
// nav. `color` (any CSS colour) defaults to grey — see
// DEFAULT_SECTION_COLOR above.
//
// A plain top-level entry (e.g. "Sites" — nothing to expand, it's just
// a page to go to) renders with the same button styling as a section
// header (2026-08-31 — they looked inconsistent otherwise), it just
// navigates on click instead of toggling. Only top-level entries get
// this treatment; the same AppShellNavItem shape used *inside* a
// section (indented) keeps the plain-link look, since a pill button
// repeated at every indent level would be far too heavy.
//
// A section's body is usually just a flat list of links (`children`),
// which this component renders and lays out itself. Occasionally a
// section needs something richer than a link list — e.g. the per-site
// page list, with per-page visibility toggles and an inline "add page"
// form — for that, a caller supplies pre-built `customChildren`
// instead, and must also say explicitly whether the section is `active`
// (since there are no child `.active` flags for this component to
// infer it from).
export type AppShellNavEntry =
  | AppShellNavItem
  | {
      label: string;
      section: true;
      key?: string;
      active?: boolean;
      color?: string;
      children: AppShellNavItem[];
    }
  | {
      label: string;
      section: true;
      key?: string;
      active: boolean;
      color?: string;
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

// Current-page highlight (2026-08-31 revision) — light grey (#E7E7E7),
// same height as a section header button (py-1), deliberately much
// quieter than the section headers themselves so the two don't compete:
// the section header says "you're in this group", this just says
// "you're on this particular page" within it. The "subtle" sub-link
// style below already used almost exactly this shade (neutral-200), so
// this brings normal links in line with it rather than introducing a
// third look.
export function NavLink({ item, indented }: { item: AppShellNavItem; indented: boolean }) {
  if (item.disabled) {
    return (
      <span
        className={`cursor-not-allowed rounded-md px-3 py-1 text-sm font-medium text-neutral-300 ${
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
        className={`ml-4 rounded-md px-3 py-1 text-sm ${
          item.active
            ? "bg-[#E7E7E7] font-medium text-neutral-900"
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
      className={`flex items-center justify-between rounded-md px-3 py-1 text-sm font-medium ${
        indented ? "ml-2" : ""
      } ${item.active ? "bg-[#E7E7E7] text-neutral-900" : "text-neutral-700 hover:bg-neutral-100"}`}
    >
      {item.label}
      {!!item.badge && (
        <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

// A top-level plain link, styled identically to a section header button
// (same pill, same default grey) so all main-menu entries look
// consistent whether or not they happen to have children to expand.
// See the AppShellNavEntry comment above for why this is separate from
// NavLink.
function TopLevelLink({ item }: { item: AppShellNavItem }) {
  if (item.disabled) {
    return (
      <span className="w-full cursor-not-allowed rounded-md bg-neutral-200 px-3 py-1 text-sm font-medium text-neutral-400">
        {item.label}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      prefetch={false}
      style={{ backgroundColor: DEFAULT_SECTION_COLOR }}
      className="flex w-full items-center justify-between rounded-md px-3 py-1 text-sm font-medium text-white hover:brightness-90"
    >
      {item.label}
      {!!item.badge && (
        <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
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
                style={{ backgroundColor: entry.color ?? DEFAULT_SECTION_COLOR }}
                className="w-full rounded-md px-3 py-1 text-left text-sm font-medium text-white hover:brightness-90"
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
        return (
          <div key={entry.href} className="mb-2">
            <TopLevelLink item={entry} />
          </div>
        );
      })}
    </>
  );
}
