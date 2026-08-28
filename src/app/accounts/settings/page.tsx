import AppShell from "@/components/AppShell";
import { getOpenAlerts } from "@/lib/alerts";
import { buildTopNavItems } from "@/lib/topNav";
import PlatformExpenseCategoriesCard from "@/components/PlatformExpenseCategoriesCard";
import { getPlatformExpenseCategories } from "@/lib/actions/platformExpenseSettings";

export const dynamic = "force-dynamic";

// New page (2026-08-28) — the category editor used to be a collapsible
// "Manage categories" section on the Expenses page; moved to its own
// Settings page, listed under Consolidated Sales in the Accounts nav
// group, same pattern as each artist's own Purchases Settings page.
export default async function AccountsSettingsPage() {
  const [categories, openAlerts] = await Promise.all([
    getPlatformExpenseCategories(),
    getOpenAlerts(),
  ]);

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("accountSettings", openAlerts.length)}
      content={
        <div className="mx-auto max-w-2xl px-6 py-6">
          <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Settings</h1>
          <p className="mb-6 text-sm text-neutral-500">
            Manage the category list offered when recording a business expense.
          </p>
          <PlatformExpenseCategoriesCard categories={categories} />
        </div>
      }
    />
  );
}
