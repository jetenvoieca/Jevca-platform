import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listCampaigns } from "@/lib/actions/campaigns";
import { listMailTemplates } from "@/lib/actions/mailTemplates";
import CampaignsView from "@/components/CampaignsView";

// Marketing → Mail Campaigns (2026-10-08) — see CampaignsView.
export const dynamic = "force-dynamic";

export default async function MailCampaignsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await db.site.findUnique({
    where: { id },
    select: { id: true, artistId: true, artist: { select: { email: true } } },
  });
  if (!site) notFound();

  const [campaigns, templates] = await Promise.all([listCampaigns(site.id), listMailTemplates()]);

  return (
    <CampaignsView
      siteId={site.id}
      artistId={site.artistId}
      artistEmail={site.artist.email}
      initialCampaigns={campaigns}
      templates={templates}
    />
  );
}
