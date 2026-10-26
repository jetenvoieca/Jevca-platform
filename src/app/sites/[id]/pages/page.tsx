import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listCurations } from "@/lib/actions/curations";
import { listPageStyles } from "@/lib/actions/pageStyles";
import { listMenuStyles } from "@/lib/actions/menuStyles";
import PagesManager from "@/components/PagesManager";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// Website → Pages (2026-10-04): the one place a site's pages are listed,
// ordered and managed — see PagesManager.tsx.
export default async function PagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page: initialPageId } = await searchParams;
  const site = await db.site.findUnique({
    where: { id },
    select: { artistId: true, menuStyleId: true },
  });
  if (!site) notFound();

  const [pages, curations, pageStyles, menuStyles, user] = await Promise.all([
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
        parentId: true,
      },
    }),
    listCurations(site.artistId),
    listPageStyles(),
    listMenuStyles(),
    getCurrentUser(),
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
      initialPageId={initialPageId ?? null}
      canEditStyles={user?.role === "ADMIN"}
    />
  );
}
