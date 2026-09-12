import { redirect, notFound } from "next/navigation";
import { resolvePreviewSiteId } from "@/lib/previewSites";

// Bare /preview/<slug> lands on Artwork Catalogue — there's no
// "overview" page in this reduced shell the way there is on the real
// /sites/[id].
export default async function PreviewRootPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!resolvePreviewSiteId(slug)) notFound();
  redirect(`/preview/${slug}/artworks`);
}
