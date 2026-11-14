"use client";

import { useRouter } from "next/navigation";
import type { CatalogueArtist } from "@/lib/masterCatalogue";

// Administration → Catalogue's client: choosing one opens their Catalogue.
export default function CatalogueArtistPicker({
  artists,
  artistId,
}: {
  artists: CatalogueArtist[];
  artistId: string | null;
}) {
  const router = useRouter();
  return (
    <div className="mb-6 flex items-center gap-3">
      <h1 className="text-2xl font-semibold text-neutral-900">Catalogue</h1>
      <select
        value={artistId ?? ""}
        onChange={(e) => e.target.value && router.push(`/accounts/catalogue/${e.target.value}`)}
        aria-label="Artist"
        className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800"
      >
        {!artistId && <option value="">Choose an artist…</option>}
        {artists.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.works})
          </option>
        ))}
      </select>
    </div>
  );
}
