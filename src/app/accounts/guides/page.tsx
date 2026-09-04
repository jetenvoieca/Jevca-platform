import AppShell from "@/components/AppShell";
import { getOpenAlerts } from "@/lib/alerts";
import { buildTopNavItems } from "@/lib/topNav";
import GuidesPanel from "@/components/GuidesPanel";
import { listGuides } from "@/lib/actions/guides";

export const dynamic = "force-dynamic";

// Guides (2026-09-04, direct request) — step-by-step documentation the
// platform owner writes for themselves, listed in the Administration
// menu just above Settings. Platform-wide, same pattern as the Settings
// page just below it.
export default async function GuidesPage() {
  const [guides, openAlerts] = await Promise.all([listGuides(), getOpenAlerts()]);

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("guides", openAlerts.length)}
      content={
        <div className="mx-auto max-w-2xl px-6 py-6">
          <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Guides</h1>
          <p className="mb-6 text-sm text-neutral-500">
            Step-by-step instructions you write for yourself — split into User and Technical
            topics, each downloadable as a PDF.
          </p>
          <GuidesPanel guides={guides} />
        </div>
      }
    />
  );
}
