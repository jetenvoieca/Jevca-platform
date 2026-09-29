import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WebsiteContentView from "@/components/WebsiteContentView";
import { getWebsiteHome, getWebsitePageBySlug, listWebsitePages } from "@/lib/actions/website";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getWebsitePageBySlug(slug);
  return { title: page ? `${page.name} — Jetenvoieca` : "Jetenvoieca" };
}

// www.jetenvoieca.com/<slug> (2026-09-29) — reached through the rewrite
// in middleware.ts. Same WebsiteContentView the editor previews; the
// Contact page also shows the Home page's email.
export default async function PublicWebsitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [page, pages] = await Promise.all([getWebsitePageBySlug(slug), listWebsitePages()]);
  if (!page) notFound();

  const email = page.kind === "CONTACT" ? (await getWebsiteHome()).email : null;

  return (
    <main className="h-screen overflow-y-auto">
      <WebsiteContentView
        page={page}
        email={email}
        nav={[
          { label: "Home", href: "/" },
          ...pages.map((p) => ({ label: p.name, href: `/${p.slug}` })),
        ]}
      />
    </main>
  );
}
