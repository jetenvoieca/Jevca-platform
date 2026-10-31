import PublishedSiteLink from "@/components/PublishedSiteLink";
import PublishButton from "@/components/PublishButton";
import BackToDashboardLink from "@/components/BackToDashboardLink";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/currentUser";
import { PATHNAME_HEADER } from "@/lib/auth";
import { cleanMenuAccess, siteNavKeyForPath } from "@/lib/siteMenuAccess";
import { db } from "@/lib/db";
import { getLastPublishedAt } from "@/lib/actions/siteSnapshot";
import { publishedHomePath } from "@/lib/siteSnapshot";
import { getOpenAlerts } from "@/lib/alerts";
import { getClientSites, getRecentSites, recordSiteVisit } from "@/lib/recentSites";
import { siteLabel } from "@/lib/siteLabel";
import SiteShell from "@/components/SiteShell";
import SiteNameField from "@/components/SiteNameField";
import ClientWordsProvider from "@/components/ClientWordsProvider";
import { PageHeadingSlot } from "@/components/PageHeading";

// Without this, Next can treat this layout as static-cacheable (it uses
// no dynamic APIs like cookies()/headers(), just plain db reads) and
// serve stale data (alerts, last published) from the Full Route
// Cache — the site's own Settings page (src/app/sites/[id]/page.tsx)
// already sets this for the same reason.
export const dynamic = "force-dynamic";

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await db.site.findUnique({
    where: { id },
    include: { artist: true },
    relationLoadStrategy: "query",
  });
  if (!site) notFound();

  // Who's asking (2026-10-26). An artist login only reaches their own
  // client's sites, and in them only the menu items ticked for them on
  // the Client page; anything else goes back to "/", which sends them to
  // what they may use.
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const artistLogin = user.role === "ARTIST";
  const allowed = artistLogin ? cleanMenuAccess(site.artist.menuAccess) : null;
  if (artistLogin) {
    if (site.artistId !== user.artistId) redirect("/");
    const key = siteNavKeyForPath((await headers()).get(PATHNAME_HEADER) ?? "", id);
    if (!key || !allowed!.includes(key)) redirect("/");
  }

  // Opening a site records the visit (Site.lastVisitedAt). The recent
  // sites under "Sites" in the menu are this site, then the one opened
  // before it — for an artist, their own sites instead, and no alerts
  // (they're Administration's).
  const [openAlerts, lastPublishedAt, previousSites] = await Promise.all([
    artistLogin ? Promise.resolve([]) : getOpenAlerts(),
    getLastPublishedAt(id),
    artistLogin ? getClientSites(site.artistId, id) : getRecentSites({ excludeSiteId: id, take: 1 }),
    artistLogin ? Promise.resolve() : recordSiteVisit(id),
  ]);
  const recentSites = [
    { id, label: artistLogin ? site.name : siteLabel(site.artist.name, site.name) },
    ...previousSites,
  ];

  // Back to the Dashboard (only when opened from an alert), publish, then
  // the published site's globe (2026-10-31, Craig's mockups) — in the
  // header at full width; on a narrower screen beside the menu button
  // instead (see AppShell's topActions).
  const siteIcons = (className: string) => (
    <div className={`items-center gap-1 ${className}`}>
      <BackToDashboardLink />
      <PublishButton siteId={id} lastPublishedAt={lastPublishedAt?.toISOString() ?? null} />
      <PublishedSiteLink href={publishedHomePath(site.id)} />
    </div>
  );

  // Everything inside the site words itself for the client's type
  // (Artwork / Product, Gallery / Store…) — see ClientWordsProvider.
  return (
    <ClientWordsProvider kind={site.artist.kind}>
      <SiteShell
        siteId={id}
        salesEnabled={site.salesEnabled}
        alertCount={openAlerts.length}
        recentSites={recentSites}
        allowed={allowed}
        topActions={siteIcons("flex")}
        header={
          // Site name left, the page's own heading (if any) centred, the
          // site's icons right (at full width — see siteIcons).
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <SiteNameField
              site={{
                id: site.id,
                name: site.name,
                domain: site.domain,
                defaultCurrency: site.defaultCurrency,
                domainStatus: site.domainStatus,
                domainRenewalDate: site.domainRenewalDate,
              }}
              ownerName={site.artist.name}
            />
            <PageHeadingSlot />
            {siteIcons("hidden justify-self-end min-[1180px]:flex")}
          </div>
        }
      >
        {children}
      </SiteShell>
    </ClientWordsProvider>
  );
}
