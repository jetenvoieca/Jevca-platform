import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageForPath, publishedHomePath } from "@/lib/siteSnapshot";
import { loadPublishedSite } from "../published";

// A site's own pages, as last published (2026-10-06) — the home page (no
// address after the site) is the first of its Live Pages; the others are
// at their page's address. The site itself — every page and its menu —
// is drawn by the layout (../layout.tsx, see PublishedSite), loaded once
// and then shown in the browser (2026-10-13), so this route only gives
// an address its title, a missing page its "not found", and the
// messages for a site with nothing to show yet. Private for now: like
// every admin address, only reachable when logged in (see
// middleware.ts).
export const dynamic = "force-dynamic";

type Params = Promise<{ siteId: string; slug?: string[] }>;

function pathOf(siteId: string, slug: string[] | undefined): string {
  return slug?.length ? `${publishedHomePath(siteId)}/${slug.join("/")}` : publishedHomePath(siteId);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { siteId, slug } = await params;
  const published = await loadPublishedSite(siteId);
  if (!published) return { title: "Not published yet" };
  const { snapshot } = published;
  const page = pageForPath(siteId, snapshot.pages, pathOf(siteId, slug));
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
  if (pageForPath(siteId, snapshot.pages, pathOf(siteId, slug))) return null;
  if (slug?.length) notFound();
  return (
    <main className="flex min-h-[100dvh] items-center justify-center p-6">
      <p className="text-center text-sm text-neutral-500">This site has no Live Pages yet.</p>
    </main>
  );
}
