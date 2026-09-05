import type { AppShellNavEntry } from "@/components/SidebarNav";

export type TopNavKey =
  | "sites"
  | "alerts"
  | "inbox"
  | "subscriptions"
  | "expenses"
  | "accountSummary"
  | "sales"
  | "guides"
  | "accountSettings";

// Restructured 2026-08-28 — "Accounts" is now a section header grouping
// the account-related pages, rather than a page in its own right.
// "Subscriptions" is the old /accounts content (subscription revenue),
// relabelled; "Expenses" was split out from what used to be embedded on
// that same page; "Account" is the Sales/Expenses/Net summary; "Settings"
// (added same day) is the expense-category editor, moved out of Expenses
// into its own page, listed last after Consolidated Sales as requested.
// Section label itself renamed "Accounts" -> "Administration" 2026-08-31
// (the `key` stays "accounts" — it's just an internal id for tracking
// which section is open, nothing reads it as a label).
//
// "Guides" added 2026-09-04, direct request — step-by-step
// documentation the platform owner writes for themselves, placed just
// above Settings as asked.
//
// "Inbox" added 2026-09-05, Email Integration — the unified admin inbox
// for every reply to an artist's own @jevca.art address plus ad hoc
// admin emails (see AdminInboxPanel.tsx). Placed right after Alerts:
// a new-reply alert links straight into here (see lib/alerts.ts), so
// the two sit next to each other.
//
// Split out as its own function (2026-08-31) so the per-site menu
// (siteNav.ts) can render an identical group instead of duplicating
// this list — the labels, hrefs, and active-state logic stay in
// exactly one place. Pass `active: null` from a context where none of
// these pages is the current one (e.g. from inside a site), so nothing
// here is shown as active/open.
export function buildAccountsSection(
  active: TopNavKey | null,
  alertCount: number
): AppShellNavEntry {
  return {
    label: "Administration",
    section: true,
    key: "accounts",
    children: [
      { label: "Alerts", href: "/alerts", active: active === "alerts", badge: alertCount },
      { label: "Inbox", href: "/accounts/inbox", active: active === "inbox" },
      { label: "Subscriptions", href: "/accounts", active: active === "subscriptions" },
      { label: "Expenses", href: "/accounts/expenses", active: active === "expenses" },
      { label: "Account", href: "/accounts/summary", active: active === "accountSummary" },
      { label: "Consolidated Sales", href: "/accounts/sales", active: active === "sales" },
      { label: "Guides", href: "/accounts/guides", active: active === "guides" },
      { label: "Settings", href: "/accounts/settings", active: active === "accountSettings" },
    ],
  };
}

export function buildTopNavItems(active: TopNavKey, alertCount: number): AppShellNavEntry[] {
  return [
    buildAccountsSection(active, alertCount),
    { label: "Sites", href: "/", active: active === "sites" },
  ];
}
