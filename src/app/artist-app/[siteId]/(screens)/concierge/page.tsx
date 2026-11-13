import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { artistAppHref } from "@/lib/artistApp";
import { readSiteFeatures } from "@/lib/siteFeaturesData";
import { listConciergeRequests } from "@/lib/actions/concierge";
import ArtistConciergeView from "@/components/artist-app/ArtistConciergeView";

export const dynamic = "force-dynamic";

// The Concierge (2026-11-13) — with Personal Concierge only. Access to the
// site is checked by the app's layout.
export default async function ArtistConciergePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  if (!(await readSiteFeatures(siteId)).concierge) redirect(artistAppHref(siteId, "pages"));
  const site = await db.site.findUnique({ where: { id: siteId }, select: { artistId: true } });
  if (!site) notFound();
  return (
    <ArtistConciergeView siteId={siteId} artistId={site.artistId} requests={await listConciergeRequests(siteId)} />
  );
}
