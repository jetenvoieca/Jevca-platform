import { redirect } from "next/navigation";
import { db } from "@/lib/db";

// "Open Site" from the Sites Directory should land somewhere useful — the
// first page a visitor would actually see, per the site's active Menu —
// rather than the generic Web Site landing message. Resolved here, lazily,
// rather than looked up for every row in the Sites Directory list.
export default async function OpenSitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const activeMenu = await db.menu.findFirst({
    where: { siteId: id, isActive: true },
    include: {
      groups: {
        orderBy: { position: "asc" },
        include: {
          items: { orderBy: { position: "asc" }, take: 1 },
        },
      },
    },
  });

  // The first group by position that actually has an item in it — an
  // empty leading group shouldn't stop this from finding the real first page.
  const firstGroupWithItem = activeMenu?.groups.find((g) => g.items.length > 0);
  const firstPageId = firstGroupWithItem?.items[0]?.pageId;

  if (firstPageId) {
    redirect(`/sites/${id}/pages/${firstPageId}`);
  }

  // No active menu, or an active menu with nothing in it yet — fall back
  // to the Web Site section rather than a dead end.
  redirect(`/sites/${id}`);
}
