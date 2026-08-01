import { db } from "@/lib/db";
import {
  listMedia,
  countMediaByPurpose,
  getMediaTagPresets,
  getArtistArtworksForLinking,
} from "@/lib/actions/mediaCatalogue";
import MediaCatalogueView from "@/components/MediaCatalogueView";

export const dynamic = "force-dynamic";

type SearchParams = {
  purpose?: string;
  q?: string;
  tag?: string;
  artworkId?: string;
  sort?: string;
};

export default async function MediaCataloguePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const purpose = sp.purpose === "related" ? "related" : "marketing";

  const site = await db.site.findUnique({ where: { id }, select: { artistId: true } });
  const artistId = site!.artistId;

  const [mediaRows, counts, tagPresets, artistArtworks] = await Promise.all([
    listMedia(artistId, { purpose, q: sp.q, tag: sp.tag, artworkId: sp.artworkId, sort: sp.sort }),
    countMediaByPurpose(artistId),
    getMediaTagPresets(artistId),
    getArtistArtworksForLinking(artistId),
  ]);

  const media = mediaRows.map((m) => ({
    id: m.id,
    url: m.url,
    posterUrl: m.posterUrl,
    kind: m.kind,
    caption: m.caption,
    artwork: m.artwork,
  }));

  return (
    <MediaCatalogueView
      siteId={id}
      artistId={artistId}
      media={media}
      purpose={purpose}
      q={sp.q || ""}
      tag={sp.tag || ""}
      artworkId={sp.artworkId || ""}
      sort={sp.sort || ""}
      counts={counts}
      tagPresets={tagPresets}
      artistArtworks={artistArtworks}
      selected={null}
    />
  );
}
