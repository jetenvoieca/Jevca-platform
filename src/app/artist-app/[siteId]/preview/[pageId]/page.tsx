import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listPageStyles } from "@/lib/actions/pageStyles";
import { getLastPublishedAt } from "@/lib/actions/siteSnapshot";
import { readContactPanel } from "@/lib/contactPanel";
import ArtistPagePreview from "@/components/artist-app/ArtistPagePreview";

export const dynamic = "force-dynamic";

// A page's preview in the Artist App (2026-11-08, Craig): the page as it
// will look once published, full screen, from the site's working data —
// as Pages previews it in the admin. The Contact panel page shows the
// first Live page with its panel open over it.
export default async function ArtistPagePreviewPage({
  params,
}: {
  params: Promise<{ siteId: string; pageId: string }>;
}) {
  const { siteId, pageId } = await params;
  const select = { id: true, title: true, curationId: true, pageStyleId: true, contactPanel: true } as const;
  const [page, site, styles, lastPublishedAt] = await Promise.all([
    db.page.findFirst({ where: { id: pageId, siteId }, select }),
    db.site.findUnique({ where: { id: siteId }, select: { artistId: true } }),
    listPageStyles(),
    getLastPublishedAt(siteId),
  ]);
  if (!page || !site) notFound();

  const contactPanel = readContactPanel(page.contactPanel);
  const shown = contactPanel
    ? ((
        await db.page.findMany({ where: { siteId, visible: true }, orderBy: { position: "asc" }, select })
      ).find((p) => !readContactPanel(p.contactPanel)) ?? null)
    : page;

  return (
    <ArtistPagePreview
      siteId={siteId}
      artistId={site.artistId}
      pageId={page.id}
      title={page.title}
      shown={
        shown
          ? {
              id: shown.id,
              curationId: shown.curationId,
              style: styles.find((s) => s.id === shown.pageStyleId) ?? null,
            }
          : null
      }
      contactPanel={contactPanel}
      lastPublishedAt={lastPublishedAt?.toISOString() ?? null}
    />
  );
}
