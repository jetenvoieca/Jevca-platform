import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listSocialPosts } from "@/lib/actions/socialPosts";
import SocialView from "@/components/SocialView";

// Marketing → Social Media (2026-10-15) — see SocialView.
export const dynamic = "force-dynamic";

export default async function SocialMediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // The post to open (SocialView keeps it here).
  searchParams: Promise<{ post?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const site = await db.site.findUnique({ where: { id }, select: { id: true, artistId: true } });
  if (!site) notFound();

  const posts = await listSocialPosts(site.artistId);

  return (
    <SocialView
      siteId={site.id}
      artistId={site.artistId}
      initialPosts={posts}
      initialOpenId={sp.post ?? null}
    />
  );
}
