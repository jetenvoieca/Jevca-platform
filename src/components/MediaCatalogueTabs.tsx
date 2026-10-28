import Link from "next/link";
import type { CatalogueView } from "@/lib/mediaTabs";

// The Media Catalogue's views — see lib/mediaTabs.ts.
export default function MediaCatalogueTabs({
  siteId,
  current,
}: {
  siteId: string;
  current: CatalogueView;
}) {
  const href = (tab: CatalogueView) => `/sites/${siteId}/media?purpose=${tab}`;
  const plain = (tab: CatalogueView) =>
    `px-4 py-1.5 ${current === tab ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"}`;
  return (
    <div className="flex overflow-hidden rounded-full border border-neutral-300 text-sm">
      <Link href={href("artworks")} className={plain("artworks")}>
        Artworks
      </Link>
      <Link href={href("marketing")} className={plain("marketing")}>
        Marketing
      </Link>
      <Link href={href("videos")} className={plain("videos")}>
        Videos
      </Link>
      <Link href={href("music")} className={plain("music")}>
        Music
      </Link>
      <Link href={href("stickers")} className={plain("stickers")}>
        Stickers
      </Link>
    </div>
  );
}
