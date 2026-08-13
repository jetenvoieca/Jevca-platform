import Link from "next/link";
import { logout } from "@/lib/actions/auth";

export type AppShellNavItem = {
  label: string;
  href: string;
  active?: boolean;
  disabled?: boolean;
};

export default function AppShell({
  preview,
  content,
  rightPanel,
  publishEnabled = false,
  navItems,
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
  navItems: AppShellNavItem[];
}) {
  const hasPreview = preview !== undefined && preview !== null;
  const hasRightPanel = rightPanel !== undefined && rightPanel !== null;

  // Tailwind only picks up class names that appear literally in the
  // source, so this has to be an explicit lookup rather than a built-up
  // string — an interpolated grid-cols-[...] value silently does nothing.
  const gridColsClass = hasPreview
    ? hasRightPanel
      ? "grid-cols-[340px_1fr_300px_220px]"
      : "grid-cols-[340px_1fr_220px]"
    : hasRightPanel
      ? "grid-cols-[1fr_300px_220px]"
      : "grid-cols-[1fr_220px]";

  return (
    <div className={`grid h-screen overflow-hidden ${gridColsClass}`}>
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
      <div className="flex h-full flex-col border-l border-neutral-200">
        <div className="border-b border-neutral-200 p-4">
          <button
            type="button"
            disabled={!publishEnabled}
            className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 disabled:hover:bg-neutral-200"
          >
            Publish to live site
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
          {navItems.map((item) =>
            item.disabled ? (
              <span
                key={item.href}
                className="cursor-not-allowed rounded-md px-3 py-2 text-sm font-medium text-neutral-300"
              >
                {item.label}
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  item.active
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-700 hover:bg-neutral-100"
                }`}
              >
                {item.label}
              </Link>
            )
          )}
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
  );
}
