import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  listMedia,
  countMediaByPurpose,
  getMediaTagPresets,
  getArtistArtworksForLinking,
  getMediaDetail,
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

export default async function MediaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; mediaId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id, mediaId } = await params;
  const sp = await searchParams;
  const purpose = sp.purpose === "related" ? "related" : "marketing";

  const site = await db.site.findUnique({ where: { id }, select: { artistId: true } });
  if (!site) notFound();
  const artistId = site.artistId;

  const [mediaRows, counts, tagPresets, artistArtworks, item] = await Promise.all([
    listMedia(artistId, { purpose, q: sp.q, tag: sp.tag, artworkId: sp.artworkId, sort: sp.sort }),
    countMediaByPurpose(artistId),
    getMediaTagPresets(artistId),
    getArtistArtworksForLinking(artistId),
    getMediaDetail(mediaId),
  ]);

  if (!item || item.artistId !== artistId) notFound();

  const media = mediaRows.map((m) => ({
    id: m.id,
    url: m.url,
    posterUrl: m.posterUrl,
    kind: m.kind,
    caption: m.caption,
    artwork: m.artwork,
  }));

  const selected = {
    id: item.id,
    url: item.url,
    posterUrl: item.posterUrl,
    kind: item.kind,
    caption: item.caption,
    altText: item.altText,
    tags: item.tags,
    artworkId: item.artworkId,
    artwork: item.artwork,
  };

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
      selected={selected}
    />
  );
}
