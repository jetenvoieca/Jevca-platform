import Link from "next/link";

export type MediaCatalogueTab = "artworks" | "marketing" | "related";

// The Media Catalogue's views (2026-10-15): Artworks (the catalogue's
// works, to look at and pick from — read only), Marketing and Related.
export default function MediaCatalogueTabs({
  siteId,
  current,
  relatedCount,
}: {
  siteId: string;
  current: MediaCatalogueTab;
  relatedCount: number;
}) {
  const href = (tab: MediaCatalogueTab) => `/sites/${siteId}/media?purpose=${tab}`;
  const plain = (tab: MediaCatalogueTab) =>
    `px-4 py-1.5 ${current === tab ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"}`;
  return (
    <div className="flex overflow-hidden rounded-full border border-neutral-300 text-sm">
      <Link href={href("artworks")} className={plain("artworks")}>
        Artworks
      </Link>
      <Link href={href("marketing")} className={plain("marketing")}>
        Marketing
      </Link>
      <Link
        href={href("related")}
        className={`px-4 py-1.5 font-medium ${
          current === "related"
            ? "bg-neutral-900 text-white"
            : "bg-rose-100 text-rose-700 hover:bg-rose-200"
        }`}
      >
        Related ({relatedCount})
      </Link>
    </div>
  );
}
