import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listArtworks, getArtworkDetail } from "@/lib/actions/artworks";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import ArtworksCatalogueView from "../ArtworksCatalogueView";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  availability?: string;
  location?: string;
  type?: string;
  group?: string;
  sort?: string;
};

export default async function ArtworkDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; artworkId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id, artworkId } = await params;
  const sp = await searchParams;

  const site = await db.site.findUnique({ where: { id }, select: { artistId: true, defaultCurrency: true } });
  if (!site) notFound();
  const artistId = site.artistId;

  const [artworks, artwork, settings] = await Promise.all([
    listArtworks(artistId, sp),
    getArtworkDetail(artworkId),
    getArtworkSettings(artistId),
  ]);

  // An artwork belongs to the artist, not this particular site — so it's a
  // valid page as long as it's one of this artist's artworks, viewed via
  // any of their sites, not only the site it happened to be created from.
  if (!artwork || artwork.artistId !== artistId) notFound();

  const rows = artworks.map((a) => ({
    id: a.id,
    presentationTitle: a.presentationTitle,
    presentationPrice: a.presentationPrice != null ? a.presentationPrice.toString() : null,
    catalogueNumber: a.catalogueNumber,
    availability: a.availability,
    imageUrl: a.images[0]?.url ?? null,
  }));

  // Decimal fields aren't serializable across the server/client boundary as-is.
  const selected = {
    id: artwork.id,
    artistId: artwork.artistId,
    catalogueNumber: artwork.catalogueNumber,
    presentationTitle: artwork.presentationTitle,
    presentationPrice: artwork.presentationPrice != null ? artwork.presentationPrice.toString() : null,
    dimensions: artwork.dimensions,
    description: artwork.description,
    medium: artwork.medium,
    presentationGroup: artwork.presentationGroup,
    availability: artwork.availability,
    visible: artwork.visible,
    catalogueName: artwork.catalogueName,
    year: artwork.year,
    type: artwork.type,
    catalogueGroup: artwork.catalogueGroup,
    size: artwork.size,
    location: artwork.location,
    edition: artwork.edition,
    availableQty: artwork.availableQty,
    priceUnframed: artwork.priceUnframed != null ? artwork.priceUnframed.toString() : null,
    priceFramed: artwork.priceFramed != null ? artwork.priceFramed.toString() : null,
    studioNotes: artwork.studioNotes,
    images: artwork.images.map((img) => ({ id: img.id, url: img.url })),
    paymentPlan: artwork.paymentPlan
      ? {
          id: artwork.paymentPlan.id,
          type: artwork.paymentPlan.type,
          totalAmount: artwork.paymentPlan.totalAmount.toString(),
          currency: artwork.paymentPlan.currency,
          instalmentCount: artwork.paymentPlan.instalmentCount,
          releaseMessage: artwork.paymentPlan.releaseMessage,
          releaseTriggerCount: artwork.paymentPlan.releaseTriggerCount,
          buyerName: artwork.paymentPlan.buyerName,
          buyerEmail: artwork.paymentPlan.buyerEmail,
          payments: artwork.paymentPlan.payments.map((p) => ({
            id: p.id,
            sequence: p.sequence,
            amount: p.amount.toString(),
            currency: p.currency,
            status: p.status,
            dueDate: p.dueDate ? p.dueDate.toISOString() : null,
            paidDate: p.paidDate ? p.paidDate.toISOString() : null,
          })),
        }
      : null,
  };

  return (
    <ArtworksCatalogueView
      siteId={id}
      artistId={artistId}
      artworks={rows}
      q={sp.q || ""}
      availability={sp.availability || ""}
      location={sp.location || ""}
      type={sp.type || ""}
      group={sp.group || ""}
      sort={sp.sort || ""}
      selected={selected}
      settings={settings}
      siteDefaultCurrency={site.defaultCurrency}
    />
  );
}
