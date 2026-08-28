import type { AppShellNavEntry } from "@/components/AppShell";

export type TopNavKey =
  | "sites"
  | "alerts"
  | "subscriptions"
  | "expenses"
  | "accountSummary"
  | "sales"
  | "accountSettings";

// Restructured 2026-08-28 — "Accounts" is now a section header grouping
// the account-related pages, rather than a page in its own right.
// "Subscriptions" is the old /accounts content (subscription revenue),
// relabelled; "Expenses" was split out from what used to be embedded on
// that same page; "Account" is the Sales/Expenses/Net summary; "Settings"
// (added same day) is the expense-category editor, moved out of Expenses
// into its own page, listed last after Consolidated Sales as requested.
export function buildTopNavItems(active: TopNavKey, alertCount: number): AppShellNavEntry[] {
  return [
    {
      label: "Accounts",
      section: true,
      children: [
        { label: "Alerts", href: "/alerts", active: active === "alerts", badge: alertCount },
        { label: "Subscriptions", href: "/accounts", active: active === "subscriptions" },
        { label: "Expenses", href: "/accounts/expenses", active: active === "expenses" },
        { label: "Account", href: "/accounts/summary", active: active === "accountSummary" },
        { label: "Consolidated Sales", href: "/accounts/sales", active: active === "sales" },
        { label: "Settings", href: "/accounts/settings", active: active === "accountSettings" },
      ],
    },
    { label: "Sites", href: "/", active: active === "sites" },
  ];
}
