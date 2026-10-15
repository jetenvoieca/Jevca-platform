import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listCampaigns } from "@/lib/actions/campaigns";
import { listMailTemplates } from "@/lib/actions/mailTemplates";
import { listMailLists } from "@/lib/actions/subscribers";
import CampaignsView from "@/components/CampaignsView";

// Marketing → Mail Campaigns (2026-10-08) — see CampaignsView.
export const dynamic = "force-dynamic";

export default async function MailCampaignsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // The campaign and mail to open (CampaignsView keeps them here).
  searchParams: Promise<{ campaign?: string; mail?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const site = await db.site.findUnique({
    where: { id },
    select: { id: true, artistId: true, artist: { select: { email: true } } },
  });
  if (!site) notFound();

  const [campaigns, templates, lists] = await Promise.all([
    listCampaigns(site.id),
    listMailTemplates(),
    listMailLists(site.artistId),
  ]);

  return (
    <CampaignsView
      siteId={site.id}
      artistId={site.artistId}
      artistEmail={site.artist.email}
      initialCampaigns={campaigns}
      initialOpen={sp.campaign ? { campaignId: sp.campaign, mailId: sp.mail ?? null } : null}
      templates={templates}
      lists={lists}
    />
  );
}
