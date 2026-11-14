"use client";

import { useRouter } from "next/navigation";
import type { CatalogueArtist } from "@/lib/masterCatalogue";

// Administration → Catalogue and Curator (2026-11-14): the screen's title
// and its client — choosing one opens `${basePath}/<client>`.
export default function AdminArtistPicker({
  title,
  basePath,
  artists,
  artistId,
  showCounts = false,
}: {
  title: string;
  basePath: string;
  artists: CatalogueArtist[];
  artistId: string | null;
  // Each client's works' count (Catalogue).
  showCounts?: boolean;
}) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
      <select
        value={artistId ?? ""}
        onChange={(e) => e.target.value && router.push(`${basePath}/${e.target.value}`)}
        aria-label="Client"
        className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800"
      >
        {!artistId && <option value="">Choose…</option>}
        {artists.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {showCounts ? ` (${a.works})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
