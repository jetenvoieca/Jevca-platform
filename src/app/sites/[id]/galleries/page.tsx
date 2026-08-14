import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listGalleries } from "@/lib/actions/customers";
import GalleriesView from "@/components/GalleriesView";

export default async function GalleriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const site = await db.site.findUnique({
    where: { id },
    select: { artistId: true },
  });
  if (!site) notFound();

  // Deliberately no "Take payments" gate here, unlike Customers — a
  // gallery is worth tracking (approaching, negotiating, sending
  // consignment) long before any sale has happened, which is the whole
  // point (2026-08-14).
  const galleries = await listGalleries(site.artistId);

  return <GalleriesView siteId={id} artistId={site.artistId} galleries={galleries} />;
}
