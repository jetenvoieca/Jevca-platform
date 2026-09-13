import { db } from "@/lib/db";
import WipeTestDataForm from "@/components/WipeTestDataForm";

export const dynamic = "force-dynamic";

// One-time cleanup tool (2026-09-13, direct request) — see the fuller
// note on wipeArtistContent (lib/actions/wipeTestData.ts) for why this
// exists and why it should be removed again once used. Not linked from
// any navigation on purpose — reached only via this direct URL, scoped
// to whichever site you're viewing it from (so run it from the "Art
// World" site, not Louise Dear's).
export default async function WipeTestDataPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await db.site.findUnique({
    where: { id },
    select: { artistId: true, artist: { select: { name: true } } },
  });
  if (!site) return <div className="p-6">Site not found.</div>;

  return (
    <div className="p-6">
      <WipeTestDataForm artistId={site.artistId} artistName={site.artist.name} />
    </div>
  );
}
