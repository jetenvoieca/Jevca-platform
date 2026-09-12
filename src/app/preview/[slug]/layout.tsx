import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { countHopper } from "@/lib/actions/hopper";
import { resolvePreviewSiteId } from "@/lib/previewSites";
import PreviewShell from "@/components/PreviewShell";

// Same reasoning as the real /sites/[id] layout — this reads straight
// from the db on every request, so it must never be served from the
// Full Route Cache.
export const dynamic = "force-dynamic";

export default async function PreviewLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const siteId = resolvePreviewSiteId(slug);
  if (!siteId) notFound();

  const site = await db.site.findUnique({
    where: { id: siteId },
    include: { artist: true },
  });
  if (!site) notFound();

  const hopperCount = await countHopper(site.artistId);

  return (
    <PreviewShell
      basePath={`/preview/${slug}`}
      siteLabel={site.name.trim() || site.artist.name}
      hopperCount={hopperCount}
    >
      {children}
    </PreviewShell>
  );
}
