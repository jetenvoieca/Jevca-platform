import type { ArtistFormFields, SiteFormFields } from "@/lib/actions";

// The full set of Owner/Financial artist fields needed to safely
// resubmit updateArtist without wiping anything else (2026-09-12) — see
// buildArtistFormData in lib/actions.ts. Every card that edits any one
// of these fields (OwnerCard, SubscriptionCard) needs the artist's
// current value for all the others, since updateArtist itself isn't a
// true partial update. This is a superset of ArtistFormFields (which is
// the plain-string shape the form actually submits) using the same
// nullable shape the database/Prisma actually returns.
export type ArtistRecord = {
  id: string;
  name: string;
  firstName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  subscriptionAmount: string;
  paymentMethod: string | null;
  addressLine1: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  vatNumber: string | null;
  vatRate: string;
  invoiceFooterText: string | null;
  invoiceLanguage: string;
  emailSlug: string | null;
  hopperToken: string;
  stripeSubscriptionCustomerId: string | null;
  stripeSubscriptionStatus: string | null;
};

export function toArtistFormFields(artist: ArtistRecord): ArtistFormFields {
  return {
    name: artist.name,
    firstName: artist.firstName || "",
    email: artist.email || "",
    phone: artist.phone || "",
    notes: artist.notes || "",
    subscriptionAmount: artist.subscriptionAmount,
    paymentMethod: artist.paymentMethod || "",
    addressLine1: artist.addressLine1 || "",
    city: artist.city || "",
    postcode: artist.postcode || "",
    country: artist.country || "",
    vatNumber: artist.vatNumber || "",
    vatRate: artist.vatRate,
    invoiceFooterText: artist.invoiceFooterText || "",
    invoiceLanguage: artist.invoiceLanguage,
  };
}

// The site fields needed to safely resubmit updateSite — see
// buildSiteFormData in lib/actions.ts.
export type SiteRecord = {
  id: string;
  name: string;
  domain: string | null;
  status: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED" | "ISYT";
  defaultCurrency: string;
  templateId: string | null;
  domainStatus: string | null;
  domainRenewalDate: string;
};

export function toSiteFormFields(site: SiteRecord): SiteFormFields {
  return {
    name: site.name,
    domain: site.domain || "",
    defaultCurrency: site.defaultCurrency,
    templateId: site.templateId || "",
    domainStatus: site.domainStatus || "",
    domainRenewalDate: site.domainRenewalDate,
  };
}
