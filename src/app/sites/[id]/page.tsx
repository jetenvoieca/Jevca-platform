import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await db.site.findUnique({
    where: { id },
    include: { artist: true },
  });

  if (!site) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← Back to Sites
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-neutral-900">
        {site.name}
      </h1>
      <p className="mt-1 text-sm text-neutral-500">Owner: {site.artist.name}</p>

      <div className="mt-8 rounded-lg border border-dashed border-neutral-300 p-6 text-sm text-neutral-600">
        The site editor (Sections, Private Pages, Artworks, Images) isn't
        built yet — that's the next step on the build plan. This page just
        confirms the Site record itself was created correctly.
      </div>
    </main>
  );
}
