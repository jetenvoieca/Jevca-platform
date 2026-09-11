"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions/auth";
import SidebarNav from "@/components/SidebarNav";
import type { AppShellNavEntry } from "@/components/SidebarNav";

export type { AppShellNavItem, AppShellNavEntry } from "@/components/SidebarNav";

export default function AppShell({
  preview,
  content,
  rightPanel,
  publishEnabled = false,
  publishAction,
  navItems,
  nav,
}: {
  // Omit entirely (leave as null/undefined) when a page has nothing to
  // preview — e.g. a plain list. Reserving a fixed 340px column that just
  // shows placeholder text is wasted space; when preview is absent the
  // grid collapses to two columns instead (2026-08-13).
  preview?: React.ReactNode;
  content: React.ReactNode;
  // A persistent narrow column sitting between content and the nav —
  // used for the Sites list, which needs to stay visible and clickable
  // even once a site is selected and its settings fill `content`
  // (2026-08-13, in response to direct feedback that the list
  // disappearing was a step backward).
  rightPanel?: React.ReactNode;
  // Publish is greyed out until there's a specific site open with pending
  // draft changes — neither of which exists at the top-level Sites screen,
  // so callers leave this false until that logic is built.
  publishEnabled?: boolean;
  // Server action that actually performs the publish, bound to whatever
  // the caller needs (e.g. a specific site id). Callers with nothing
  // publishable (the top-level Accounts pages) leave this undefined —
  // the button then stays disabled regardless of publishEnabled, same
  // as before this existed.
  publishAction?: (formData: FormData) => void | Promise<void>;
  // Static nav data — AppShell renders it via SidebarNav itself. Fine
  // for navs that don't depend on anything besides props already known
  // server-side (e.g. an explicit "active" key passed in per page).
  navItems?: AppShellNavEntry[];
  // Alternative to navItems: a fully-built nav element, for callers whose
  // nav needs to work out its own active state from the current URL
  // (e.g. the per-site menu, which covers many routes under /sites/[id]/*
  // and would otherwise need every single one of those pages to pass its
  // own explicit "active" key up through this layout). Exactly one of
  // navItems / nav should be given.
  nav?: React.ReactNode;
}) {
  const hasPreview = preview !== undefined && preview !== null;
  const hasRightPanel = rightPanel !== undefined && rightPanel !== null;

  // Tailwind only picks up class names that appear literally in the
  // source, so this has to be an explicit lookup rather than a built-up
  // string — an interpolated grid-cols-[...] value silently does nothing.
  // Split into a mobile base (no 220px nav track — the nav is a fixed
  // overlay below 1180px, see mobileNavOpen below, and an empty grid
  // track would otherwise leave a dead 220px gap even with nothing
  // placed in it) and a min-[1180px]: override that restores the
  // original fixed-column layout once the nav goes back to being a
  // normal, always-visible column (2026-09-11, direct request).
  const gridColsBase = hasPreview
    ? hasRightPanel
      ? "grid-cols-[340px_1fr_300px]"
      : "grid-cols-[340px_1fr]"
    : hasRightPanel
      ? "grid-cols-[1fr_300px]"
      : "grid-cols-[1fr]";
  const gridColsDesktop = hasPreview
    ? hasRightPanel
      ? "min-[1180px]:grid-cols-[340px_1fr_300px_220px]"
      : "min-[1180px]:grid-cols-[340px_1fr_220px]"
    : hasRightPanel
      ? "min-[1180px]:grid-cols-[1fr_300px_220px]"
      : "min-[1180px]:grid-cols-[1fr_220px]";

  // Mobile nav drawer (2026-09-11, direct request — the fixed 220px
  // sidebar column ate too much of a tablet's screen). Below 1180px the
  // sidebar becomes a slide-over panel instead of a static column,
  // opened via a hamburger button that takes the Publish row's place in
  // a full-width top bar until then. `pathname` closes the drawer
  // automatically the moment a link inside it is actually followed —
  // this works uniformly across every kind of nav content this
  // component can render (plain SidebarNav links, a caller's own `nav`
  // element, or a section's customChildren) without needing to hook
  // into each one's individual click handlers.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Mobile top bar — hamburger only, hidden at/above 1180px where
          the sidebar is a static column with its own visible Publish
          button already. */}
      <div className="flex items-center justify-end border-b border-neutral-200 p-4 min-[1180px]:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open menu"
          className="rounded-md border border-neutral-300 p-2 hover:bg-neutral-50"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className={`grid flex-1 overflow-hidden ${gridColsBase} ${gridColsDesktop}`}>
        {/* Each column scrolls independently — a caller that wants its own
            fixed header (title, filters, table header row) structures its
            content as a flex column with a non-scrolling header and a
            flex-1 overflow-y-auto body, same pattern as the menu column
            below. A caller with nothing to pin can just render plain
            content and this column's own scrolling handles it. */}
        {hasPreview && (
          <div className="h-full overflow-y-auto border-r border-neutral-200 bg-neutral-50">
            {preview}
          </div>
        )}
        <div className="h-full overflow-y-auto">{content}</div>
        {hasRightPanel && (
          <div className="h-full overflow-y-auto border-l border-neutral-200">{rightPanel}</div>
        )}

        {/* Backdrop — mobile only, only rendered while the drawer is
            open (nothing to darken above 1180px, where the sidebar is
            just a normal column). */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/30 min-[1180px]:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        <div
          className={`fixed inset-y-0 right-0 z-50 flex w-[260px] flex-col border-l border-neutral-200 bg-white shadow-xl transition-transform duration-200 ease-out ${
            mobileNavOpen ? "translate-x-0" : "translate-x-full"
          } min-[1180px]:static min-[1180px]:inset-auto min-[1180px]:z-auto min-[1180px]:h-full min-[1180px]:w-auto min-[1180px]:translate-x-0 min-[1180px]:shadow-none min-[1180px]:transition-none`}
        >
          <div className="flex items-center gap-2 border-b border-neutral-200 p-4">
            <form action={publishAction} className="min-w-0 flex-1">
              <button
                type="submit"
                disabled={!publishEnabled || !publishAction}
                className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 disabled:hover:bg-neutral-200"
              >
                Publish to live site
              </button>
            </form>
            {/* Explicit close, alongside the backdrop-tap — mobile only. */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close menu"
              className="shrink-0 rounded-md border border-neutral-300 p-2 hover:bg-neutral-50 min-[1180px]:hidden"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
            {nav ?? <SidebarNav entries={navItems ?? []} />}
          </nav>

          {/* Fixed footer, same non-scrolling treatment as the Publish
              header above — sits outside the scrolling <nav>, not inside
              it, so it stays visible regardless of list length. */}
          <form action={logout} className="border-t border-neutral-200 p-4">
            <button
              type="submit"
              className="w-full rounded-md px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
            >
              Log out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
