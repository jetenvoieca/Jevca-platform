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

const PAGE_SIZE = 60;

type SearchParams = {
  purpose?: string;
  q?: string;
  tag?: string;
  artworkId?: string;
  sort?: string;
  // Deep-link to a specific item's detail panel (e.g. from the Hopper's
  // "Added to Media Catalogue" link) — read once on first load only.
  // Selecting a *different* item afterwards happens client-side, without
  // going through this route again (2026-08-08 perf pass — see
  // MediaCatalogueView for why).
  selected?: string;
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

  const [{ rows: mediaRows, total }, counts, tagPresets, artistArtworks, selectedItem] =
    await Promise.all([
      listMedia(artistId, {
        purpose,
        q: sp.q,
        tag: sp.tag,
        artworkId: sp.artworkId,
        sort: sp.sort,
        limit: PAGE_SIZE,
      }),
      countMediaByPurpose(artistId),
      getMediaTagPresets(artistId),
      getArtistArtworksForLinking(artistId),
      sp.selected ? getMediaDetail(sp.selected) : Promise.resolve(null),
    ]);

  const media = mediaRows.map((m) => ({
    id: m.id,
    url: m.url,
    posterUrl: m.posterUrl,
    kind: m.kind,
    caption: m.caption,
    artwork: m.artwork,
  }));

  const selected =
    selectedItem && selectedItem.artistId === artistId
      ? {
          id: selectedItem.id,
          url: selectedItem.url,
          posterUrl: selectedItem.posterUrl,
          kind: selectedItem.kind,
          caption: selectedItem.caption,
          altText: selectedItem.altText,
          tags: selectedItem.tags,
          artworkId: selectedItem.artworkId,
          artwork: selectedItem.artwork,
        }
      : null;

  return (
    <MediaCatalogueView
      siteId={id}
      artistId={artistId}
      media={media}
      total={total}
      pageSize={PAGE_SIZE}
      purpose={purpose}
      q={sp.q || ""}
      tag={sp.tag || ""}
      artworkId={sp.artworkId || ""}
      sort={sp.sort || ""}
      counts={counts}
      tagPresets={tagPresets}
      artistArtworks={artistArtworks}
      initialSelected={selected}
    />
  );
}
