import { db } from "@/lib/db";
import {
  listMedia,
  getMediaTagPresets,
  getMediaDetail,
} from "@/lib/actions/mediaCatalogue";
import { getBackfillCount } from "@/lib/actions/imageBackfill";
import MediaCatalogueView from "@/components/MediaCatalogueView";
import MediaArtworksView from "@/components/MediaArtworksView";
import { mediaListFilters, readCatalogueView } from "@/lib/mediaTabs";
import MusicLibraryView from "@/components/MusicLibraryView";
import { listMusic } from "@/lib/actions/music";
import StickerLibraryView from "@/components/StickerLibraryView";
import { listStickers } from "@/lib/actions/stickers";
import { listArtworks, listArtworkNames } from "@/lib/actions/artworks";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import { listCurations } from "@/lib/actions/curations";
import ImageBackfillPanel from "@/components/ImageBackfillPanel";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

type SearchParams = {
  purpose?: string;
  q?: string;
  tag?: string;
  // Deep-link to a specific item's detail panel (e.g. from the Hopper's
  // "Added to Media Catalogue" link) — read once on first load only.
  // Selecting a *different* item afterwards happens client-side, without
  // going through this route again (2026-08-08 perf pass — see
  // MediaCatalogueView for why).
  selected?: string;
  // The Artworks view's filters (2026-10-15) — see MediaArtworksView.
  curation?: string;
  name?: string;
  location?: string;
  type?: string;
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
  const site = await db.site.findUnique({ where: { id }, select: { artistId: true } });
  const artistId = site!.artistId;

  const tab = readCatalogueView(sp.purpose);

  // Music view (2026-10-16): the artist's Music library.
  if (tab === "music") {
    const tracks = await listMusic(artistId);
    return <MusicLibraryView siteId={id} artistId={artistId} initialTracks={tracks} />;
  }

  // Stickers view (2026-10-16): the artist's Stickers library.
  if (tab === "stickers") {
    const stickers = await listStickers(artistId);
    return <StickerLibraryView siteId={id} artistId={artistId} initialStickers={stickers} />;
  }

  // Artworks view (2026-10-15): the catalogue's works, read only.
  if (tab === "artworks") {
    const filters = {
      curation: sp.curation || "",
      name: sp.name || "",
      location: sp.location || "",
      type: sp.type || "",
      sort: sp.sort || "",
    };
    const [{ rows, total }, settings, names, curations] = await Promise.all([
      listArtworks(artistId, {
        curation: filters.curation || undefined,
        name: filters.name || undefined,
        location: filters.location || undefined,
        type: filters.type || undefined,
        sort: filters.sort || undefined,
        limit: PAGE_SIZE,
      }),
      getArtworkSettings(artistId),
      listArtworkNames(artistId),
      listCurations(artistId),
    ]);
    return (
      <MediaArtworksView
        siteId={id}
        artistId={artistId}
        artworks={rows}
        total={total}
        pageSize={PAGE_SIZE}
        filters={filters}
        curations={curations}
        names={names}
        locations={settings.locations.map((l) => l.name)}
        types={settings.artworkTypes}
      />
    );
  }

  const purpose = tab;

  const [{ rows: mediaRows, total }, tagPresets, selectedItem, backfillCount] =
    await Promise.all([
      listMedia(artistId, {
        ...mediaListFilters(purpose),
        q: sp.q,
        tag: sp.tag,
        limit: PAGE_SIZE,
      }),
      getMediaTagPresets(artistId),
      sp.selected ? getMediaDetail(sp.selected) : Promise.resolve(null),
      getBackfillCount(artistId),
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
          displayUrl: selectedItem.displayUrl,
          posterUrl: selectedItem.posterUrl,
          kind: selectedItem.kind,
          caption: selectedItem.caption,
          altText: selectedItem.altText,
          tags: selectedItem.tags,
          artwork: selectedItem.artwork,
        }
      : null;

  return (
    <>
      <div className="px-6 pt-4">
        <ImageBackfillPanel artistId={artistId} siteId={id} initialCount={backfillCount} />
      </div>
      <MediaCatalogueView
        siteId={id}
        artistId={artistId}
        media={media}
        total={total}
        pageSize={PAGE_SIZE}
        purpose={purpose}
        q={sp.q || ""}
        tag={sp.tag || ""}
        tagPresets={tagPresets}
        initialSelected={selected}
      />
    </>
  );
}
