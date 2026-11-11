import { db } from "@/lib/db";
import { getSiteAccount } from "@/lib/actions/plans";
import ArtistAccountView from "@/components/artist-app/ArtistAccountView";

export const dynamic = "force-dynamic";

// Account (2026-11-10, Craig's mockup): the site's plan and what it
// includes, the client's contact details, and the add-ons to choose —
// the whole width (2026-11-11).
export default async function ArtistAccountPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  // Checked by getSiteAccount first.
  const account = await getSiteAccount(siteId);
  const site = await db.site.findUniqueOrThrow({
      where: { id: siteId },
      select: {
        artist: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            instagramHandle: true,
            facebookUrl: true,
            tiktokHandle: true,
          },
        },
      },
  });

  return <ArtistAccountView siteId={siteId} account={account} contact={site.artist} />;
}
