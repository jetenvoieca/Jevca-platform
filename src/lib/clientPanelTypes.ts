// FormData builders for updateSite / updateArtist (lib/actions.ts) live
// here rather than in actions.ts itself — that file has "use server" at
// the top, and Next.js requires every export from a "use server" file to
// be an async Server Action; these are plain synchronous helpers, so
// they have to live in an ordinary module instead (2026-09-12 build fix
// — Turbopack rejected them from actions.ts with "Server Actions must be
// async functions").

import type { ClientKind } from "@/lib/clientKind";

export type ArtistFormFields = {
  name: string;
  firstName: string;
  email: string;
  phone: string;
  notes: string;
  subscriptionAmount: string;
  paymentMethod: string;
  addressLine1: string;
  city: string;
  postcode: string;
  country: string;
  vatNumber: string;
  vatRate: string;
  invoiceFooterText: string;
  invoiceLanguage: string;
};

export function buildArtistFormData(
  base: ArtistFormFields,
  changes: Partial<ArtistFormFields> & { nextInvoiceNumber?: string; emailSlug?: string }
): FormData {
  const merged = { ...base, ...changes };
  const fd = new FormData();
  fd.set("name", merged.name);
  fd.set("firstName", merged.firstName);
  fd.set("email", merged.email);
  fd.set("phone", merged.phone);
  fd.set("notes", merged.notes);
  fd.set("subscriptionAmount", merged.subscriptionAmount);
  fd.set("paymentMethod", merged.paymentMethod);
  fd.set("addressLine1", merged.addressLine1);
  fd.set("city", merged.city);
  fd.set("postcode", merged.postcode);
  fd.set("country", merged.country);
  fd.set("vatNumber", merged.vatNumber);
  fd.set("vatRate", merged.vatRate);
  fd.set("invoiceFooterText", merged.invoiceFooterText);
  fd.set("invoiceLanguage", merged.invoiceLanguage);
  // Left off entirely unless actually being changed — mirrors the
  // conditional reads in updateArtist (lib/actions.ts).
  if (changes.nextInvoiceNumber) fd.set("nextInvoiceNumber", changes.nextInvoiceNumber);
  if (changes.emailSlug) fd.set("emailSlug", changes.emailSlug);
  return fd;
}

export type SiteFormFields = {
  name: string;
  domain: string;
  defaultCurrency: string;
  domainStatus: string;
  domainRenewalDate: string;
};

export function buildSiteFormData(base: SiteFormFields, changes: Partial<SiteFormFields>): FormData {
  const merged = { ...base, ...changes };
  const fd = new FormData();
  fd.set("name", merged.name);
  fd.set("domain", merged.domain);
  fd.set("defaultCurrency", merged.defaultCurrency);
  fd.set("domainStatus", merged.domainStatus);
  fd.set("domainRenewalDate", merged.domainRenewalDate);
  return fd;
}

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
  kind: ClientKind;
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
  subscriptionCancelledAt: string | null; // ISO
};

// Only the fields the form resubmits — so any artist record that has
// them (the client cards' ArtistRecord, Site Settings' own) can be passed.
type ArtistFormSource = Pick<
  ArtistRecord,
  | "name"
  | "firstName"
  | "email"
  | "phone"
  | "notes"
  | "subscriptionAmount"
  | "paymentMethod"
  | "addressLine1"
  | "city"
  | "postcode"
  | "country"
  | "vatNumber"
  | "vatRate"
  | "invoiceFooterText"
  | "invoiceLanguage"
>;

export function toArtistFormFields(artist: ArtistFormSource): ArtistFormFields {
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
  domainStatus: string | null;
  domainRenewalDate: string;
};

export function toSiteFormFields(site: SiteRecord): SiteFormFields {
  return {
    name: site.name,
    domain: site.domain || "",
    defaultCurrency: site.defaultCurrency,
    domainStatus: site.domainStatus || "",
    domainRenewalDate: site.domainRenewalDate,
  };
}
