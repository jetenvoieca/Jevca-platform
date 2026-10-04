import { db } from "@/lib/db";
import PagesManager from "@/components/PagesManager";

export const dynamic = "force-dynamic";

// Website → Pages (2026-10-04): the one place a site's pages are listed,
// ordered and managed — see PagesManager.tsx.
export default async function PagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pages = await db.page.findMany({
    where: { siteId: id },
    orderBy: { position: "asc" },
    select: { id: true, title: true, visible: true },
  });

  return <PagesManager siteId={id} pages={pages} />;
}
