import OwnerCard from "@/components/OwnerCard";
import DomainCard from "@/components/DomainCard";
import SubscriptionCard from "@/components/SubscriptionCard";
import HopperTokenCard from "@/components/HopperTokenCard";
import type { ArtistRecord, SiteRecord } from "@/lib/clientPanelTypes";

type SubscriptionPaymentRow = {
  id: string;
  source: "STRIPE" | "MANUAL";
  amount: string;
  currency: string;
  paidAt: string;
};

// Administration → Clients (2026-09-12) — the admin-only view of a
// site's Owner/Domain/Subscription/Hopper Token details, with no
// Financial (Sales/Invoicing) or Personal Profile content, per direct
// request: those belong to the artist's own per-site "Profile" page
// (SiteSettingsPanel), not this cross-client admin list. Reuses the
// exact same four cards as that page — see the note on each one — laid
// out as a wider three-column row instead of one narrow stacked column,
// since there's no Financial/Personal Profile panel competing for space
// here.
export default function ClientOwnerPanel({
  site,
  artist,
  templates,
  subscriptionPayments,
}: {
  site: SiteRecord;
  artist: ArtistRecord;
  templates: { id: string; name: string }[];
  subscriptionPayments: SubscriptionPaymentRow[];
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <h1 className="mb-4 text-lg font-semibold text-neutral-900">{site.name}</h1>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <OwnerCard artist={artist} className="lg:flex-1" />
        <DomainCard site={site} templates={templates} className="lg:flex-1" />
        <div className="flex flex-col gap-4 lg:flex-1">
          <SubscriptionCard
            artist={artist}
            siteId={site.id}
            defaultCurrency={site.defaultCurrency}
            subscriptionPayments={subscriptionPayments}
          />
          <HopperTokenCard artistId={artist.id} hopperToken={artist.hopperToken} />
        </div>
      </div>
    </div>
  );
}
