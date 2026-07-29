import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { createPage, publishSite } from "@/lib/actions/pages";

export default async function SiteWebsitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const site = await db.site.findUnique({
    where: { id },
    include: { artist: true },
  });
  if (!site) notFound();

  const pages = await db.page.findMany({
    where: { siteId: id },
    orderBy: { position: "asc" },
  });

  const hasUnpublished = pages.some(
    (p) => JSON.stringify(p.draftBlocks) !== JSON.stringify(p.liveBlocks)
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← Back to Sites
      </Link>

      <div className="mt-4 mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{site.name}</h1>
          <p className="text-sm text-neutral-500">Owner: {site.artist.name}</p>
        </div>
        <form action={publishSite.bind(null, site.id)}>
          <button
            type="submit"
            disabled={!hasUnpublished}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            {hasUnpublished ? "Publish to Live Site" : "All changes published"}
          </button>
        </form>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <form
          action={createPage.bind(null, site.id, "SECTION")}
          className="rounded-lg border border-dashed border-neutral-300 p-4"
        >
          <label className="mb-2 block text-sm font-medium text-neutral-700">
            + Create New Section
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              name="title"
              required
              placeholder="e.g. Exhibitions"
              className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              Create
            </button>
          </div>
        </form>

        <form
          action={createPage.bind(null, site.id, "PRIVATE")}
          className="rounded-lg border border-dashed border-neutral-300 p-4"
        >
          <label className="mb-2 block text-sm font-medium text-neutral-700">
            + Create New Private Page
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              name="title"
              required
              placeholder="e.g. Spring Newsletter Landing"
              className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              Create
            </button>
          </div>
        </form>
      </div>

      <div className="mt-10">
        {pages.length === 0 ? (
          <p className="text-sm text-neutral-500">No pages yet — create one above.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 font-medium">Title</th>
                <th className="py-2 font-medium">Type</th>
                <th className="py-2 font-medium">Visibility</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => {
                const isUnpublished =
                  JSON.stringify(page.draftBlocks) !== JSON.stringify(page.liveBlocks);
                return (
                  <tr key={page.id} className="border-b border-neutral-100">
                    <td className="py-3">
                      <Link
                        href={`/sites/${site.id}/pages/${page.id}`}
                        className="font-medium text-neutral-900 hover:underline"
                      >
                        {page.title}
                      </Link>
                    </td>
                    <td className="py-3 text-neutral-500">
                      {page.type === "SECTION" ? "Section" : "Private"}
                    </td>
                    <td className="py-3 text-neutral-500">
                      {page.visible ? "Shown in nav" : "Hidden"}
                    </td>
                    <td className="py-3">
                      {isUnpublished ? (
                        <span className="text-amber-600">● Unpublished changes</span>
                      ) : (
                        <span className="text-green-600">Published</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
