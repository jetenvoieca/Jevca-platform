import { cookies } from "next/headers";
import { db } from "@/lib/db";
import ClientsDirectoryView from "@/components/ClientsDirectoryView";
import { getOpenAlerts } from "@/lib/alerts";
import { SITES_STATUS_FILTER_COOKIE, normalizeSitesStatusFilter } from "@/lib/sitesStatusFilter";

export const dynamic = "force-dynamic";

// Administration → Clients (2026-09-12) — the admin-only list of every
// site/artist, same underlying data as the Sites Directory ("/") but
// linking into "/clients/[id]" (Owner/Domain/Subscription only, no
// Financial or Personal Profile) instead of "/sites/[id]".
export default async function ClientsDirectoryPage() {
  const cookieStore = await cookies();
  const status = normalizeSitesStatusFilter(cookieStore.get(SITES_STATUS_FILTER_COOKIE)?.value);

  const sites = await db.site.findMany({
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
  });

  const rows = sites.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    ownerName: s.artist.name,
    paymentMethod: s.artist.paymentMethod,
    createdAt: s.createdAt.toISOString(),
  }));

  const openAlerts = await getOpenAlerts();

  return <ClientsDirectoryView sites={rows} status={status} alertCount={openAlerts.length} />;
}
