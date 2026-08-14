import type { AppShellNavItem } from "@/components/AppShell";

export type TopNavKey = "sites" | "alerts" | "accounts" | "sales";

export function buildTopNavItems(active: TopNavKey, alertCount: number): AppShellNavItem[] {
  return [
    { label: "Sites", href: "/", active: active === "sites" },
    { label: "Alerts", href: "/alerts", active: active === "alerts", badge: alertCount },
    { label: "Accounts", href: "/accounts", active: active === "accounts" },
    { label: "Consolidated Sales", href: "/accounts/sales", active: active === "sales" },
  ];
}
