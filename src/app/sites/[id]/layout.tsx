import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await db.site.findUnique({
    where: { id },
    include: { artist: true },
  });
  if (!site) notFound();

  return (
    <div>
      <div className="border-b border-neutral-200 px-6 py-4">
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← Back to Sites
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">{site.name}</h1>
            <p className="text-sm text-neutral-500">Owner: {site.artist.name}</p>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link
              href={`/sites/${id}`}
              className="text-neutral-700 hover:text-neutral-900 hover:underline"
            >
              Web Site
            </Link>
            <Link
              href={`/sites/${id}/artworks`}
              className="text-neutral-700 hover:text-neutral-900 hover:underline"
            >
              Artworks
            </Link>
            <span className="cursor-not-allowed text-neutral-300">Images (soon)</span>
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
