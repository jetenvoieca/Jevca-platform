import Link from "next/link";
import { listArtworks, createArtwork } from "@/lib/actions/artworks";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  availability?: string;
  visibility?: string;
  sort?: string;
  view?: string;
};

function buildQuery(sp: SearchParams, overrides: Partial<SearchParams>) {
  const combined = { ...sp, ...overrides };
  const params = new URLSearchParams();
  Object.entries(combined).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  return params.toString();
}

export default async function ArtworksCataloguePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const view = sp.view === "tile" ? "tile" : "list";

  const artworks = await listArtworks(id, {
    q: sp.q,
    availability: sp.availability,
    visibility: sp.visibility,
    sort: sp.sort,
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Artworks</h2>
        <form action={createArtwork.bind(null, id)} className="flex gap-2">
          <input
            type="text"
            name="title"
            required
            placeholder="New artwork title"
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            + Add New Artwork
          </button>
        </form>
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          name="q"
          defaultValue={sp.q}
          placeholder="Search title, catalogue #, medium"
          className="w-64 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          name="availability"
          defaultValue={sp.availability || ""}
          className="rounded-md border border-neutral-300 px-2 py-2 text-sm"
        >
          <option value="">All availability</option>
          <option value="AVAILABLE">Available</option>
          <option value="RESERVED">Reserved</option>
          <option value="SOLD">Sold</option>
        </select>
        <select
          name="visibility"
          defaultValue={sp.visibility || ""}
          className="rounded-md border border-neutral-300 px-2 py-2 text-sm"
        >
          <option value="">All visibility</option>
          <option value="shown">Shown</option>
          <option value="hidden">Hidden</option>
        </select>
        <select
          name="sort"
          defaultValue={sp.sort || ""}
          className="rounded-md border border-neutral-300 px-2 py-2 text-sm"
        >
          <option value="">Sort: Date added</option>
          <option value="title">Sort: Title</option>
          <option value="price">Sort: Price</option>
        </select>
        <input type="hidden" name="view" value={view} />
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
        >
          Apply
        </button>

        <div className="ml-auto flex overflow-hidden rounded-md border border-neutral-300 text-sm">
          <Link
            href={`?${buildQuery(sp, { view: "list" })}`}
            className={`px-3 py-1.5 ${
              view === "list" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"
            }`}
          >
            List
          </Link>
          <Link
            href={`?${buildQuery(sp, { view: "tile" })}`}
            className={`px-3 py-1.5 ${
              view === "tile" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"
            }`}
          >
            Tile
          </Link>
        </div>
      </form>

      {artworks.length === 0 ? (
        <p className="text-sm text-neutral-500">No artworks match.</p>
      ) : view === "tile" ? (
        <div className="grid grid-cols-4 gap-4">
          {artworks.map((a) => (
            <Link key={a.id} href={`/sites/${id}/artworks/${a.id}`} className="block">
              {a.images[0] ? (
                <img
                  src={a.images[0].url}
                  alt=""
                  className="aspect-square w-full rounded-md object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-400">
                  No image
                </div>
              )}
              <p className="mt-1 truncate text-sm font-medium text-neutral-900">{a.title}</p>
              <p className="text-xs text-neutral-500">
                {a.price ? `£${String(a.price)}` : "—"} · {a.availability}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2 font-medium"></th>
              <th className="py-2 font-medium">Title</th>
              <th className="py-2 font-medium">Catalogue #</th>
              <th className="py-2 font-medium">Medium</th>
              <th className="py-2 font-medium">Price</th>
              <th className="py-2 font-medium">Availability</th>
              <th className="py-2 font-medium">Visibility</th>
            </tr>
          </thead>
          <tbody>
            {artworks.map((a) => (
              <tr key={a.id} className="border-b border-neutral-100">
                <td className="py-2">
                  {a.images[0] ? (
                    <img src={a.images[0].url} alt="" className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-neutral-100" />
                  )}
                </td>
                <td className="py-2">
                  <Link
                    href={`/sites/${id}/artworks/${a.id}`}
                    className="font-medium text-neutral-900 hover:underline"
                  >
                    {a.title}
                  </Link>
                </td>
                <td className="py-2 text-neutral-500">{a.catalogueNumber}</td>
                <td className="py-2 text-neutral-500">{a.medium || "—"}</td>
                <td className="py-2 text-neutral-500">
                  {a.price ? `£${String(a.price)}` : "—"}
                </td>
                <td className="py-2 text-neutral-500">{a.availability}</td>
                <td className="py-2 text-neutral-500">{a.visible ? "Shown" : "Hidden"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
