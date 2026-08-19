import AppShell from "@/components/AppShell";
import SitesListColumn from "@/components/SitesListColumn";
import { buildTopNavItems } from "@/lib/topNav";

type SiteRow = {
  id: string;
  name: string;
  status: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED" | "ISYT";
  ownerName: string;
  paymentMethod: string | null;
  createdAt: string;
};

export default function SitesDirectoryView({
  sites,
  q,
  sort,
  showArchived,
  alertCount = 0,
}: {
  sites: SiteRow[];
  q: string;
  sort: string;
  showArchived: boolean;
  alertCount?: number;
}) {
  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("sites", alertCount)}
      rightPanel={
        <SitesListColumn sites={sites} q={q} sort={sort} showArchived={showArchived} />
      }
      content={
        <div className="flex h-full items-center justify-center p-6">
          <p className="max-w-xs text-center text-sm text-neutral-400">
            Select a site from the list to view and edit its settings.
          </p>
        </div>
      }
    />
  );
}


