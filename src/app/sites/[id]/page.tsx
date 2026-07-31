import { db } from "@/lib/db";

export default async function SiteWebsitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const pageCount = await db.page.count({ where: { siteId: id } });

  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center p-6">
      {pageCount === 0 ? (
        <p className="text-sm text-neutral-500">
          No pages yet — use <span className="font-medium">+ Add New Page</span> in the menu to
          create your first one.
        </p>
      ) : (
        <p className="text-sm text-neutral-500">
          Select a page from the menu to edit it, or{" "}
          <span className="font-medium">+ Add New Page</span> to create another.
        </p>
      )}
    </div>
  );
}
