import { db } from "@/lib/db";
import { getTemplatesForDirectory } from "@/lib/actions/templates";
import type { ArtistRecord, SiteRecord } from "@/lib/clientPanelTypes";

// Everything the client cards (Owner / Domain / Subscription / Hopper
// Token) need for one site — loaded on the server and passed down as
// props, so the cards' own router.refresh() after a save re-reads it.
// Shared by Administration → Clients → one client, and by the Inbox's
// Alert view (2026-09-19, CRM Phase 3), which shows the same cards.
export type ClientPanelData = {
  site: SiteRecord;
  artist: ArtistRecord;
  templates: { id: string; name: string }[];
  subscriptionPayments: {
    id: string;
    source: "STRIPE" | "MANUAL";
    amount: string;
    currency: string;
    paidAt: string;
  }[];
};

export async function getClientPanelData(siteId: string): Promise<ClientPanelData | null> {
  const site = await db.site.findUnique({
    where: { id: siteId },
    include: { artist: true },
    relationLoadStrategy: "query",
  });
  if (!site) return null;

  const [payments, templates] = await Promise.all([
    db.subscriptionPayment.findMany({
      where: { artistId: site.artistId },
      orderBy: { paidAt: "desc" },
    }),
    getTemplatesForDirectory(""),
  ]);

  return {
    site: {
      id: site.id,
      name: site.name,
      domain: site.domain,
      status: site.status,
      defaultCurrency: site.defaultCurrency,
      templateId: site.templateId,
      domainStatus: site.domainStatus,
      domainRenewalDate: site.domainRenewalDate ? site.domainRenewalDate.toISOString().slice(0, 10) : "",
    },
    artist: {
      id: site.artist.id,
      name: site.artist.name,
      firstName: site.artist.firstName,
      email: site.artist.email,
      phone: site.artist.phone,
      notes: site.artist.notes,
      subscriptionAmount: site.artist.subscriptionAmount ? site.artist.subscriptionAmount.toString() : "",
      paymentMethod: site.artist.paymentMethod,
      addressLine1: site.artist.addressLine1,
      city: site.artist.city,
      postcode: site.artist.postcode,
      country: site.artist.country,
      vatNumber: site.artist.vatNumber,
      vatRate: site.artist.vatRate ? site.artist.vatRate.toString() : "",
      invoiceFooterText: site.artist.invoiceFooterText,
      invoiceLanguage: site.artist.invoiceLanguage,
      emailSlug: site.artist.emailSlug,
      hopperToken: site.artist.hopperToken,
      stripeSubscriptionCustomerId: site.artist.stripeSubscriptionCustomerId,
      stripeSubscriptionStatus: site.artist.stripeSubscriptionStatus,
    },
    templates: templates.map((t) => ({ id: t.id, name: t.name })),
    subscriptionPayments: payments.map((p) => ({
      id: p.id,
      source: p.source as "STRIPE" | "MANUAL",
      amount: p.amount.toString(),
      currency: p.currency,
      paidAt: Number.isNaN(p.paidAt.getTime()) ? "" : p.paidAt.toISOString(),
    })),
  };
}

// Same, starting from an artist rather than a site — uses the artist's
// first non-archived site (the same one the alerts point at).
export async function getClientPanelDataForArtist(artistId: string): Promise<ClientPanelData | null> {
  const site = await db.site.findFirst({
    where: { artistId, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return site ? getClientPanelData(site.id) : null;
}
