import type { Metadata, Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/currentUser";
import ClientWordsProvider from "@/components/ClientWordsProvider";
import ArtistAppFeaturesProvider from "@/components/artist-app/ArtistAppFeatures";
import { readSiteFeatures } from "@/lib/siteFeaturesData";

export const dynamic = "force-dynamic";

// Behaves like an app when saved to the iPad's Home Screen.
export const metadata: Metadata = {
  title: "Artist App",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Artist App", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// The Artist App (lib/artistApp.ts) — full screen; the admin, or
// (2026-11-10) a client login for its own sites. Its screens are framed
// by (screens)/layout.tsx; a page's preview (preview/[pageId]) takes the
// whole screen.
export default async function ArtistAppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { artistId: true, artist: { select: { kind: true } } },
  });
  if (!site) notFound();
  if (user.role !== "ADMIN" && user.artistId !== site.artistId) redirect("/");

  // Shared pieces (e.g. the media picker) word themselves for the
  // client's type, as in the admin — see ClientWordsProvider. What the app
  // offers follows the site's Plan and add-ons (ArtistAppFeatures).
  const features = await readSiteFeatures(siteId);
  return (
    <ClientWordsProvider kind={site.artist.kind}>
      <ArtistAppFeaturesProvider features={features}>{children}</ArtistAppFeaturesProvider>
    </ClientWordsProvider>
  );
}
