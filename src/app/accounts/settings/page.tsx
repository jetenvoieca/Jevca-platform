import AppShell from "@/components/AppShell";
import { getOpenAlerts } from "@/lib/alerts";
import { buildTopNavItems } from "@/lib/topNav";
import PlatformListCard from "@/components/PlatformListCard";
import {
  getPlatformExpenseCategories,
  addPlatformExpenseCategory,
  removePlatformExpenseCategory,
} from "@/lib/actions/platformExpenseSettings";
import {
  getPlatformTaskCategories,
  addPlatformTaskCategory,
  removePlatformTaskCategory,
} from "@/lib/actions/platformTaskSettings";

export const dynamic = "force-dynamic";

// New page (2026-08-28) — the category editor used to be a collapsible
// "Manage categories" section on the Expenses page; moved to its own
// Settings page, listed under Consolidated Sales in the Accounts nav
// group, same pattern as each artist's own Purchases Settings page.
// Task categories added 2026-09-19 (CRM Phase 2) as a second list here.
export default async function AccountsSettingsPage() {
  const [expenseCategories, taskCategories, openAlerts] = await Promise.all([
    getPlatformExpenseCategories(),
    getPlatformTaskCategories(),
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
            Manage the category lists offered on the Expenses page and the Inbox task form.
          </p>
          <div className="space-y-4">
            <PlatformListCard
              title="Expense Categories"
              description="Shown as the dropdown on the Expenses page. Removing a category here doesn't change any past expense already recorded under it — only what's offered for new entries."
              placeholder="e.g. Hosting"
              emptyText='Nothing added yet — new expenses will default to "Other" until you add some.'
              options={expenseCategories}
              onAdd={addPlatformExpenseCategory}
              onRemove={removePlatformExpenseCategory}
            />
            <PlatformListCard
              title="Task Categories"
              description="Shown as the Category dropdown on the Inbox task form. Removing a category here doesn't change any task already saved under it — only what's offered for new entries."
              placeholder="e.g. Follow up"
              emptyText="Nothing added yet — add some to offer them on the task form."
              options={taskCategories}
              onAdd={addPlatformTaskCategory}
              onRemove={removePlatformTaskCategory}
            />
          </div>
        </div>
      }
    />
  );
}
