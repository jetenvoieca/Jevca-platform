"use server";

import { db } from "@/lib/db";
import { campaignMailLabel, campaignMailOrder } from "@/lib/campaignMails";
import type { PeopleList, ResultPerson, VersionCounts } from "@/lib/campaignResults";

// Marketing → Mail Campaigns → Results (2026-10-09, step 4b): the
// numbers behind the chart, and the two people lists. Counted in the
// database, so the size of a campaign doesn't matter. Scoped by site.
// The follow-up isn't one of the versions compared, so it's left out.

export type CampaignResults = {
  sentAt: string | null;
  versions: VersionCounts[];
};

export async function getCampaignResults(campaignId: string, siteId: string): Promise<CampaignResults | null> {
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, siteId },
    select: {
      sentAt: true,
      startedAt: true,
      mails: {
        where: { kind: { in: ["PRINCIPAL", "ALTERNATIVE"] } },
        select: { id: true, kind: true, position: true },
      },
    },
  });
  if (!campaign) return null;

  const counts = await db.campaignRecipient.groupBy({
    by: ["mailId"],
    where: { campaignId, status: "SENT", mailId: { in: campaign.mails.map((m) => m.id) } },
    _count: { _all: true, deliveredAt: true, openedAt: true, clickedAt: true, bouncedAt: true, complainedAt: true },
  });
  const byMail = new Map(counts.map((c) => [c.mailId, c._count]));

  const versions = [...campaign.mails]
    .sort((a, b) => campaignMailOrder(a) - campaignMailOrder(b))
    .map((m) => {
      const c = byMail.get(m.id);
      return {
        mailId: m.id,
        label: campaignMailLabel(m.kind, m.position),
        sent: c?._all ?? 0,
        delivered: c?.deliveredAt ?? 0,
        opened: c?.openedAt ?? 0,
        clicked: c?.clickedAt ?? 0,
        bounced: c?.bouncedAt ?? 0,
        complained: c?.complainedAt ?? 0,
      };
    });

  const sentAt = campaign.sentAt ?? campaign.startedAt;
  return { sentAt: sentAt ? sentAt.toISOString() : null, versions };
}

// Who clicked, or who opened but didn't click, newest first.
export async function getCampaignPeople(
  campaignId: string,
  siteId: string,
  list: PeopleList
): Promise<ResultPerson[]> {
  const owned = await db.campaign.findFirst({ where: { id: campaignId, siteId }, select: { id: true } });
  if (!owned) return [];

  const clicked = list === "clicked";
  const rows = await db.campaignRecipient.findMany({
    where: {
      campaignId,
      status: "SENT",
      mail: { kind: { in: ["PRINCIPAL", "ALTERNATIVE"] } },
      ...(clicked ? { clickedAt: { not: null } } : { openedAt: { not: null }, clickedAt: null }),
    },
    orderBy: clicked ? { clickedAt: "desc" } : { openedAt: "desc" },
    select: {
      email: true,
      mailId: true,
      language: true,
      openedAt: true,
      clickedAt: true,
      subscriber: { select: { firstName: true, lastName: true } },
    },
  });

  return rows.map((r) => ({
    email: r.email,
    name: [r.subscriber?.firstName, r.subscriber?.lastName].filter(Boolean).join(" "),
    mailId: r.mailId,
    language: r.language,
    at: ((clicked ? r.clickedAt : r.openedAt) ?? new Date()).toISOString(),
  }));
}
