import Link from "next/link";
import { db } from "@/lib/db";
import { seedSampleData } from "@/lib/actions";
import StatusSelect from "@/components/StatusSelect";
import ArchiveButton from "@/components/ArchiveButton";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  sort?: string;
  archived?: string;
};

export default async function SitesDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() || "";
  const showArchived = params.archived === "1";
  const sort = params.sort === "date" ? "date" : "owner";

  const totalSites = await db.site.count();

  const sites = await db.site.findMany({
    where: {
      ...(showArchived ? {} : { status: { not: "ARCHIVED" } }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { artist: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { artist: true },
    orderBy:
      sort === "date" ? { createdAt: "desc" } : { artist: { name: "asc" } },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Sites</h1>
        <Link
          href="/sites/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          + Add New Site
        </Link>
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search by owner or site name"
          className="w-64 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          name="sort"
          defaultValue={sort}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="owner">Sort: Owner</option>
          <option value="date">Sort: Date created</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            name="archived"
            value="1"
            defaultChecked={showArchived}
          />
          Show archived
        </label>
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
        >
          Apply
        </button>
      </form>

      {totalSites === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center">
          <p className="mb-4 text-sm text-neutral-600">
            No sites yet. Add your first one, or load sample data to see how
            this screen looks populated.
          </p>
          <form action={seedSampleData}>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
            >
              Load sample data
            </button>
          </form>
        </div>
      ) : sites.length === 0 ? (
        <p className="text-sm text-neutral-500">No sites match your search.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2 font-medium">Owner</th>
              <th className="py-2 font-medium">Site name</th>
              <th className="py-2 font-medium">Domain</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">Date created</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => (
              <tr key={site.id} className="border-b border-neutral-100">
                <td className="py-3 text-neutral-700">{site.artist.name}</td>
                <td className="py-3">
                  <Link
                    href={`/sites/${site.id}`}
                    className="font-medium text-neutral-900 hover:underline"
                  >
                    {site.name}
                  </Link>
                </td>
                <td className="py-3 text-neutral-500">{site.domain || "—"}</td>
                <td className="py-3">
                  {site.status === "ARCHIVED" ? (
                    <span className="text-neutral-400">Archived</span>
                  ) : (
                    <StatusSelect siteId={site.id} status={site.status} />
                  )}
                </td>
                <td className="py-3 text-neutral-500">
                  {site.createdAt.toLocaleDateString()}
                </td>
                <td className="py-3 text-right">
                  <ArchiveButton
                    siteId={site.id}
                    isArchived={site.status === "ARCHIVED"}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
