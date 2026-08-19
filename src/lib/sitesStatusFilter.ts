// 2026-08-19 — the Sites list's status filter needs to be read on the
// server (it drives which sites get fetched from the database at all,
// not just how an already-loaded list looks — deliberately NOT the same
// "fetch everything, filter client-side" approach used for Sort, which
// would mean fetching every site regardless of filter on every page
// load. With this list expected to grow into the hundreds, that's not
// acceptable here even though it was fine for Sort's smaller, still
// server-filtered result set. A cookie (rather than a URL param) is what
// lets the choice persist across navigating into a specific site without
// every single link on the page needing to carry it through — both the
// Sites Directory page and the site-detail page's own embedded list read
// the same cookie server-side, so whichever was picked last stays in
// effect everywhere this list appears, until deliberately changed.
export const SITES_STATUS_FILTER_COOKIE = "jevca-sites-status";

export type SiteStatus = "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED" | "ISYT";
export const SITE_STATUS_VALUES: SiteStatus[] = ["DRAFT", "LIVE", "PAUSED", "ARCHIVED", "ISYT"];

// "" means the default view — everything except Archived — same as
// empty always has, both before and after this was a checkbox.
export function normalizeSitesStatusFilter(value: string | undefined): SiteStatus | "" {
  return SITE_STATUS_VALUES.includes(value as SiteStatus) ? (value as SiteStatus) : "";
}
