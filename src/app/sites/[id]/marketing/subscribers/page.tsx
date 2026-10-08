import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listMailLists, listSubscribers } from "@/lib/actions/subscribers";
import SubscribersView from "@/components/SubscribersView";

// Always read fresh — subscribers change from imports and sign-ups.
export const dynamic = "force-dynamic";

export default async function SubscribersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await db.site.findUnique({
    where: { id },
    select: { artistId: true, artist: { select: { name: true } } },
  });
  if (!site) notFound();

  const [subscribers, lists] = await Promise.all([
    listSubscribers(site.artistId),
    listMailLists(site.artistId),
  ]);

  return (
    <SubscribersView
      artistId={site.artistId}
      artistName={site.artist.name}
      initialSubscribers={subscribers}
      initialLists={lists}
    />
  );
}
