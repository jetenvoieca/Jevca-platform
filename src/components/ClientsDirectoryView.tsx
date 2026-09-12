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

// Administration → Clients, no client selected yet (2026-09-12) — same
// shell pattern as SitesDirectoryView, but the list links into
// "/clients/[id]" (the admin-only Owner/Domain/Subscription view)
// instead of "/sites/[id]" — see ClientOwnerPanel and the basePath prop
// on SitesListColumn.
export default function ClientsDirectoryView({
  sites,
  status,
  alertCount = 0,
}: {
  sites: SiteRow[];
  status: string;
  alertCount?: number;
}) {
  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("clients", alertCount)}
      rightPanel={
        <SitesListColumn
          sites={sites}
          q=""
          sort="owner"
          status={status}
          liveSearch={false}
          basePath="/clients"
        />
      }
      content={
        <div className="flex h-full items-center justify-center p-6">
          <p className="max-w-xs text-center text-sm text-neutral-400">
            Select a client from the list to view their Owner, Domain and Subscription details.
          </p>
        </div>
      }
    />
  );
}
