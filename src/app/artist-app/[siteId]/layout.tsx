import type { Metadata, Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/currentUser";
import ArtistAppFrame from "@/components/artist-app/ArtistAppFrame";
import ClientWordsProvider from "@/components/ClientWordsProvider";

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

// The Artist App (lib/artistApp.ts) — full screen, admin only for now.
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
  if (user.role !== "ADMIN") redirect("/");

  const site = await db.site.findUnique({ where: { id: siteId }, select: { artist: { select: { kind: true } } } });
  if (!site) notFound();

  // Shared pieces (e.g. the media picker) word themselves for the
  // client's type, as in the admin — see ClientWordsProvider.
  return (
    <ClientWordsProvider kind={site.artist.kind}>
      <ArtistAppFrame siteId={siteId}>{children}</ArtistAppFrame>
    </ClientWordsProvider>
  );
}
