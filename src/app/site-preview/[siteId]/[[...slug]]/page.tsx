import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublishedSite } from "../published";
import PublishedSiteView from "@/components/PublishedSiteView";

// A site's own pages, as last published (2026-10-06) — full screen,
// drawn from the published snapshot only (see lib/siteSnapshot.ts). The
// home page (no address after the site) is the first of its Live Pages;
// the others are at their page's address. The menu is drawn by the
// layout (../layout.tsx). Private for now: like every
// admin address, only reachable when logged in (see middleware.ts).
export const dynamic = "force-dynamic";

type Params = Promise<{ siteId: string; slug?: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { siteId, slug } = await params;
  const published = await loadPublishedSite(siteId);
  if (!published) return { title: "Not published yet" };
  const { snapshot } = published;
  const page = slug?.[0] ? snapshot.pages.find((p) => p.slug === slug[0]) : snapshot.pages[0];
  return { title: page ? `${page.title} — ${snapshot.siteName}` : snapshot.siteName };
}

export default async function SitePreviewPage({ params }: { params: Params }) {
  const { siteId, slug } = await params;
  const published = await loadPublishedSite(siteId);

  if (!published) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center p-6">
        <p className="text-center text-sm text-neutral-500">
          This site hasn&apos;t been published yet — press “Publish to live site” in the admin.
        </p>
      </main>
    );
  }

  const { snapshot } = published;
  if (slug && slug.length > 1) notFound();
  const page = slug?.[0] ? snapshot.pages.find((p) => p.slug === slug[0]) : snapshot.pages[0];

  if (!page) {
    if (slug?.[0]) notFound();
    return (
      <main className="flex min-h-[100dvh] items-center justify-center p-6">
        <p className="text-center text-sm text-neutral-500">
          This site has no Live Pages yet.
        </p>
      </main>
    );
  }

  return <PublishedSiteView snapshot={snapshot} pageId={page.id} />;
}
