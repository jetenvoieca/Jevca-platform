import AppShell from "@/components/AppShell";
import SitesListColumn from "@/components/SitesListColumn";

type SiteRow = {
  id: string;
  name: string;
  status: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED" | "ISYT";
  ownerName: string;
};

export default function SitesDirectoryView({
  sites,
  q,
  sort,
  showArchived,
}: {
  sites: SiteRow[];
  q: string;
  sort: string;
  showArchived: boolean;
}) {
  return (
    <AppShell
      publishEnabled={false}
      navItems={[{ label: "Sites", href: "/", active: true }]}
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
