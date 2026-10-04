import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listCurations } from "@/lib/actions/curations";
import PagesManager from "@/components/PagesManager";

export const dynamic = "force-dynamic";

// Website → Pages (2026-10-04): the one place a site's pages are listed,
// ordered and managed — see PagesManager.tsx.
export default async function PagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await db.site.findUnique({ where: { id }, select: { artistId: true } });
  if (!site) notFound();

  const [pages, curations] = await Promise.all([
    db.page.findMany({
      where: { siteId: id },
      orderBy: { position: "asc" },
      select: { id: true, title: true, visible: true, curationId: true },
    }),
    listCurations(site.artistId),
  ]);

  return <PagesManager siteId={id} pages={pages} curations={curations} />;
}
