import { getLastPublishedAt } from "@/lib/actions/siteSnapshot";
import ArtistAppFrame from "@/components/artist-app/ArtistAppFrame";

// The Artist App's screens, in its frame (checked by the layout above).
export default async function ArtistAppScreensLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const lastPublishedAt = await getLastPublishedAt(siteId);
  return (
    <ArtistAppFrame siteId={siteId} lastPublishedAt={lastPublishedAt?.toISOString() ?? null}>
      {children}
    </ArtistAppFrame>
  );
}
