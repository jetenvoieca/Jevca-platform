import type { AppShellNavEntry } from "@/components/SidebarNav";

export type TopNavKey =
  | "sites"
  | "clients"
  | "templates"
  | "pageStyles"
  | "menuStyles"
  | "inbox"
  | "subscriptions"
  | "expenses"
  | "accountSummary"
  | "sales"
  | "website"
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
// "Website" added 2026-09-29, direct request — the editor for the
// business's own website (jetenvoieca.com), placed just above Guides as
// asked. Deliberately separate from the artist site builder (Sites).
//
// "Inbox" added 2026-09-05, Email Integration — the unified admin inbox
// for every reply to an artist's own @jevca.art address plus ad hoc
// admin emails (see AdminInboxPanel.tsx). Since 2026-09-19 (CRM Phase 3)
// it also holds Tasks and the Alerts that used to have their own "Alerts"
// page and menu item — so the open-alerts count badge lives on Inbox now.
//
// "Clients" added 2026-09-12, direct request — the admin-only view of
// every site's Owner/Domain/Subscription/Hopper Token details (see
// ClientOwnerPanel), with no Financial or Personal Profile content
// (that's the artist-facing per-site "Profile" page instead). Placed
// first, per direct request.
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
      { label: "Clients", href: "/clients", active: active === "clients" },
      { label: "Inbox", href: "/accounts/inbox", active: active === "inbox", badge: alertCount },
      { label: "Subscriptions", href: "/accounts", active: active === "subscriptions" },
      { label: "Expenses", href: "/accounts/expenses", active: active === "expenses" },
      { label: "Account", href: "/accounts/summary", active: active === "accountSummary" },
      { label: "Consolidated Sales", href: "/accounts/sales", active: active === "sales" },
      { label: "Website", href: "/accounts/website", active: active === "website" },
      { label: "Guides", href: "/accounts/guides", active: active === "guides" },
      { label: "Settings", href: "/accounts/settings", active: active === "accountSettings" },
    ],
  };
}

// "Templates" (2026-09-06) — the reusable, cross-site design library,
// separate from any one Site. Sits above Sites, matching the ISYT design
// mockups, rather than folded into the Administration group above. A
// section since 2026-10-04: "Site Templates" (Template + TemplatePage),
// "Page Styles" (layouts a site's pages can use) and, since 2026-10-06,
// "Menus" (site menu designs). Shared with the
// per-site menu (siteNav.ts), same as buildAccountsSection.
export function buildTemplatesSection(active: TopNavKey | null): AppShellNavEntry {
  return {
    label: "Templates",
    section: true,
    key: "templates",
    children: [
      { label: "Site Templates", href: "/templates", active: active === "templates" },
      {
        label: "Page Styles",
        href: "/templates/page-styles",
        active: active === "pageStyles",
      },
      { label: "Menus", href: "/templates/menus", active: active === "menuStyles" },
    ],
  };
}

export function buildTopNavItems(active: TopNavKey, alertCount: number): AppShellNavEntry[] {
  return [
    buildAccountsSection(active, alertCount),
    buildTemplatesSection(active),
    { label: "Sites", href: "/", active: active === "sites" },
  ];
}
