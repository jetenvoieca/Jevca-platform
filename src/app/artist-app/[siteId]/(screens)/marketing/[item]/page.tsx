import { notFound } from "next/navigation";
import { isMarketingItem } from "@/lib/artistAppMarketing";
import HopperPage from "@/app/sites/[id]/hopper/page";
import MediaCataloguePage from "@/app/sites/[id]/media/page";
import BucketPage from "@/app/sites/[id]/bucket/page";
import SubscribersPage from "@/app/sites/[id]/marketing/subscribers/page";
import MailCampaignsPage from "@/app/sites/[id]/marketing/campaigns/page";
import AnalyticsPage from "@/app/sites/[id]/analytics/page";

export const dynamic = "force-dynamic";

// One Marketing manager item: the admin's screen as it is (2026-11-13 —
// to be simplified later, as Art manager was), in the app's frame. Access
// is checked by the app's layout, Marketing Manager by this one's.
export default async function ArtistMarketingItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string; item: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { siteId, item } = await params;
  if (!isMarketingItem(item)) notFound();
  const site = Promise.resolve({ id: siteId });
  const screen = {
    hopper: () => <HopperPage params={site} searchParams={searchParams} />,
    media: () => <MediaCataloguePage params={site} searchParams={searchParams} />,
    bucket: () => <BucketPage params={site} />,
    subscribers: () => <SubscribersPage params={site} />,
    campaigns: () => <MailCampaignsPage params={site} searchParams={searchParams} />,
    analytics: () => <AnalyticsPage />,
  }[item];
  return <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-white">{screen()}</div>;
}
