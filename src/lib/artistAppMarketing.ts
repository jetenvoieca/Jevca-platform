// The Artist App's Marketing manager (2026-11-13, Craig's request): the
// admin's Marketing items, each its admin screen as it is, in the app's
// frame. Social Media, PR and Marketing Settings are left out for now;
// Analytics is a placeholder. Kept apart from the screens so the side
// panel (a client component) can list them too.
export const MARKETING_ITEMS = [
  { key: "hopper", label: "Hopper" },
  { key: "media", label: "Media Catalogue" },
  { key: "bucket", label: "Video Edit" },
  { key: "subscribers", label: "Subscribers" },
  { key: "campaigns", label: "Mail Campaigns" },
  { key: "analytics", label: "Analytics" },
] as const;

export type MarketingItem = (typeof MARKETING_ITEMS)[number]["key"];

export function isMarketingItem(value: string): value is MarketingItem {
  return MARKETING_ITEMS.some((i) => i.key === value);
}
