import { redirect } from "next/navigation";
import { artistAppHref } from "@/lib/artistApp";
import { MARKETING_ITEMS } from "@/lib/artistAppMarketing";

// Marketing manager opens on its first item.
export default async function ArtistMarketingPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  redirect(`${artistAppHref(siteId, "marketing")}/${MARKETING_ITEMS[0].key}`);
}
