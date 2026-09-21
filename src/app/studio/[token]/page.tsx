import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import StudioApp from "@/components/StudioApp";

export const dynamic = "force-dynamic";

// The link is private to one artist, so it stays out of search engines,
// and it behaves like an app when saved to the iPhone Home Screen.
export const metadata: Metadata = {
  title: "JEVCA Studio",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Studio", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Each artist's own Studio app, opened from their personal link
// (/studio/<hopperToken>) — the token is the only credential, the same
// one the /api/hopper routes check. Deliberately outside the app's
// shared login (see src/middleware.ts).
export default async function StudioPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const artist = await db.artist.findUnique({
    where: { hopperToken: token },
    select: { id: true, name: true, logoUrl: true },
  });
  if (!artist) notFound();

  const settings = await getArtworkSettings(artist.id);

  return (
    <StudioApp
      token={token}
      artistName={artist.name}
      logoUrl={artist.logoUrl}
      artworkTypes={settings.artworkTypes}
      sizePresets={settings.sizePresets}
    />
  );
}
