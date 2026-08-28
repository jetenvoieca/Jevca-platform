import AppShell from "@/components/AppShell";
import { getOpenAlerts } from "@/lib/alerts";
import { buildTopNavItems } from "@/lib/topNav";
import PlatformExpensesView from "@/components/PlatformExpensesView";
import { listPlatformExpenses } from "@/lib/actions/platformExpenses";
import { getPlatformExpenseCategories } from "@/lib/actions/platformExpenseSettings";

export const dynamic = "force-dynamic";

// Split out from the Subscriptions page (2026-08-28) — was embedded
// directly below subscription revenue on /accounts, moved to its own
// page once the nav was restructured into a proper "Accounts" group.
// The underlying data/actions are unchanged, only where it's rendered.
export default async function AccountsExpensesPage() {
  const [expenses, categories, openAlerts] = await Promise.all([
    listPlatformExpenses(),
    getPlatformExpenseCategories(),
    getOpenAlerts(),
  ]);

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("expenses", openAlerts.length)}
      content={
        <div className="mx-auto max-w-3xl px-6 py-6">
          <PlatformExpensesView expenses={expenses} categories={categories} />
        </div>
      }
    />
  );
}
