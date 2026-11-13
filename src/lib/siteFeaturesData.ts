import { db } from "@/lib/db";
import { siteFeatures, type SiteFeatures } from "@/lib/plans";

// A site's features from its Plan and add-ons (2026-11-09) — see
// siteFeatures in lib/plans.ts. Plain server code, not an action: callers
// check access.
export async function readSiteFeatures(siteId: string): Promise<SiteFeatures> {
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: {
      plan: { select: { groupsIncluded: true, pagesPerGroup: true, includesWeb: true, includesArt: true, includesMarketing: true } },
      addOns: { select: { addOn: true, quantity: true } },
    },
  });
  return siteFeatures(site?.plan ?? null, site?.addOns ?? []);
}
