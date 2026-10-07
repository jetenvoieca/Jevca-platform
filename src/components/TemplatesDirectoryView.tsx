import AppShell from "@/components/AppShell";
import TemplatesListColumn from "@/components/TemplatesListColumn";
import { buildTopNavItems } from "@/lib/topNav";
import type { RecentSite } from "@/lib/recentSites";

type TemplateRow = {
  id: string;
  name: string;
  pageCount: number;
  updatedAt: string;
};

export default function TemplatesDirectoryView({
  templates,
  q,
  alertCount = 0,
  recentSites,
}: {
  templates: TemplateRow[];
  q: string;
  alertCount?: number;
  recentSites: RecentSite[];
}) {
  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("templates", alertCount, recentSites)}
      rightPanel={<TemplatesListColumn templates={templates} q={q} />}
      content={
        <div className="flex h-full items-center justify-center p-6">
          <p className="max-w-xs text-center text-sm text-neutral-400">
            Select a template from the list to view and edit its pages.
          </p>
        </div>
      }
    />
  );
}
