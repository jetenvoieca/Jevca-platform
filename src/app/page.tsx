import Link from "next/link";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import SitesDirectoryView from "@/components/SitesDirectoryView";
import { getOpenAlerts } from "@/lib/alerts";
import { SITES_STATUS_FILTER_COOKIE, normalizeSitesStatusFilter } from "@/lib/sitesStatusFilter";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; sort?: string };

export default async function SitesDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() || "";
  // 2026-08-19 — a cookie now, not a URL param (see sitesStatusFilter.ts
  // for the full reasoning: this needs to persist across navigating into
  // a specific site, without fetching every site on every load just to
  // filter client-side, which won't scale as this list grows).
  const cookieStore = await cookies();
  const status = normalizeSitesStatusFilter(cookieStore.get(SITES_STATUS_FILTER_COOKIE)?.value);
  const sort =
    params.sort === "date" ? "date" : params.sort === "payment" ? "payment" : "owner";

  const totalSites = await db.site.count();

  if (totalSites === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Sites</h1>
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center">
          <p className="mb-4 text-sm text-neutral-600">
            No sites yet. Add your first one to get started.
          </p>
          <Link
            href="/sites/new"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            + Add New Site
          </Link>
        </div>
      </main>
    );
  }

  const sites = await db.site.findMany({
    where: {
      ...(status ? { status } : { status: { not: "ARCHIVED" } }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { artist: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      artist: { select: { name: true, paymentMethod: true } },
    },
    relationLoadStrategy: "query",
    orderBy:
      sort === "date"
        ? { createdAt: "desc" }
        : sort === "payment"
          ? // Grouped by payment type, then alphabetical by owner within
            // each group — a bare payment-method sort with no secondary
            // sort would still leave same-type sites in arbitrary order.
            [{ artist: { paymentMethod: "asc" } }, { artist: { name: "asc" } }]
          : { artist: { name: "asc" } },
  });

  const rows = sites.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    ownerName: s.artist.name,
    paymentMethod: s.artist.paymentMethod,
    createdAt: s.createdAt.toISOString(),
  }));

  const openAlerts = await getOpenAlerts();

  return (
    <SitesDirectoryView
      sites={rows}
      q={q}
      sort={sort}
      status={status}
      alertCount={openAlerts.length}
    />
  );
}





