import AppShell from "@/components/AppShell";
import { buildTopNavItems } from "@/lib/topNav";
import { getOpenAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";

// Placeholder (2026-10-04) — Templates → Page Styles, replaced by the
// Page Styles list (Add / Edit / Delete) in the next step.
export default async function PageStylesPage() {
  const openAlerts = await getOpenAlerts();

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("pageStyles", openAlerts.length)}
      content={
        <div className="p-6">
          <h1 className="mb-2 text-2xl font-semibold text-neutral-900">Page Styles</h1>
          <p className="text-sm text-neutral-400">Not built yet.</p>
        </div>
      }
    />
  );
}
