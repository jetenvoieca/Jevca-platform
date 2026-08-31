// More specific than the root src/app/loading.tsx — shown while
// entering or navigating within a specific site, since that's the
// slowest, most data-heavy segment in the app (src/app/sites/[id]/
// layout.tsx fetches the site record, the pages list, four sidebar
// counts, and the alerts scan). Same reasoning as the root loading.tsx:
// this doesn't make that fetch faster, it just means "choosing a site"
// and moving around inside one gives an honest loading signal instead
// of the screen appearing frozen.
export default function SiteLoading() {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-neutral-400">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600"
          aria-hidden="true"
        />
        Loading…
      </div>
    </div>
  );
}
