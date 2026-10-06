import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listCurations } from "@/lib/actions/curations";
import { listPageStyles } from "@/lib/actions/pageStyles";
import { listMenuStyles } from "@/lib/actions/menuStyles";
import PagesManager from "@/components/PagesManager";

export const dynamic = "force-dynamic";

// Website → Pages (2026-10-04): the one place a site's pages are listed,
// ordered and managed — see PagesManager.tsx.
export default async function PagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await db.site.findUnique({
    where: { id },
    select: { artistId: true, menuStyleId: true },
  });
  if (!site) notFound();

  const [pages, curations, pageStyles, menuStyles] = await Promise.all([
    db.page.findMany({
      where: { siteId: id },
      orderBy: { position: "asc" },
      select: {
        id: true,
        title: true,
        visible: true,
        curationId: true,
        pageStyleId: true,
        menuStyleId: true,
      },
    }),
    listCurations(site.artistId),
    listPageStyles(),
    listMenuStyles(),
  ]);

  return (
    <PagesManager
      siteId={id}
      artistId={site.artistId}
      pages={pages}
      curations={curations}
      pageStyles={pageStyles}
      menuStyles={menuStyles}
      siteMenuStyleId={site.menuStyleId}
    />
  );
}
