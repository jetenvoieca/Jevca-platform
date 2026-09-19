import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import AppShell from "@/components/AppShell";
import ClientOwnerPanel from "@/components/ClientOwnerPanel";
import SitesListColumn from "@/components/SitesListColumn";
import { buildTopNavItems } from "@/lib/topNav";
import { getOpenAlerts } from "@/lib/alerts";
import { getClientPanelData } from "@/lib/clientPanelData";
import { SITES_STATUS_FILTER_COOKIE, normalizeSitesStatusFilter } from "@/lib/sitesStatusFilter";

export const dynamic = "force-dynamic";

// Administration → Clients → one client (2026-09-12) — the admin-only
// Owner/Domain/Subscription/Hopper Token view of a site, deliberately
// without the Financial (Sales/Invoicing) or Personal Profile content
// that the artist-facing per-site "Profile" page shows — see
// ClientOwnerPanel. The data itself comes from getClientPanelData, shared
// with the Inbox's Alert view.
export default async function ClientAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Same cookie the Sites Directory / per-site jump list read — see
  // sitesStatusFilter.ts — so this admin list stays in sync with
  // whatever status filter was last chosen anywhere else in the app.
  const cookieStore = await cookies();
  const status = normalizeSitesStatusFilter(cookieStore.get(SITES_STATUS_FILTER_COOKIE)?.value);

  const [data, allSites, openAlerts] = await Promise.all([
    getClientPanelData(id),
    db.site.findMany({
      where: status ? { status } : { status: { not: "ARCHIVED" } },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        artist: { select: { name: true, paymentMethod: true } },
      },
      relationLoadStrategy: "query",
      orderBy: { artist: { name: "asc" } },
    }),
    getOpenAlerts(),
  ]);
  if (!data) notFound();

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("clients", openAlerts.length)}
      rightPanel={
        <SitesListColumn
          sites={allSites.map((s) => ({
            id: s.id,
            name: s.name,
            status: s.status,
            ownerName: s.artist.name,
            paymentMethod: s.artist.paymentMethod,
            createdAt: s.createdAt.toISOString(),
          }))}
          q=""
          sort="owner"
          status={status}
          selectedId={id}
          liveSearch={false}
          basePath="/clients"
        />
      }
      content={
        <ClientOwnerPanel
          site={data.site}
          artist={data.artist}
          templates={data.templates}
          subscriptionPayments={data.subscriptionPayments}
        />
      }
    />
  );
}
