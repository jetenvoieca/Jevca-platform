"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { publicMediaUrl } from "@/lib/r2";

export type CustomerKind = "INDIVIDUAL" | "GALLERY";

export type CustomerSummary = {
  id: string;
  kind: CustomerKind;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  // "PROSPECT" | "ACTIVE" | null — gallery-only, null for Individuals.
  relationshipStatus: string | null;
};

export type CustomerDetail = {
  id: string;
  kind: CustomerKind;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  // Gallery-only (2026-08-14) — always present on the type so the form
  // doesn't need separate optional-prop plumbing, just null/empty for an
  // Individual.
  contactName: string | null;
  contactEmail: string | null;
  websiteName: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  defaultCommissionPercent: string | null;
  relationshipStatus: string | null;
  language: string | null;
  notes: string | null;
  createdAt: string;
  purchases: {
    id: string;
    artworkId: string;
    artworkTitle: string;
    artworkImageUrl: string | null;
    artworkMedium: string | null;
    artworkSize: string | null;
    artworkDescription: string | null;
    totalAmount: string;
    currency: string;
    status: "ACTIVE" | "COMPLETED" | "ABANDONED";
    channel: "STRIPE" | "GALLERY";
    createdAt: string;
  }[];
  // Other artists this same email address also buys from — computed live
  // by matching, not an explicit link (2026-08-13 decision: separate
  // records per artist, since terms can genuinely differ). Only the
  // artist's name is ever exposed this way, never their notes, terms, or
  // sale details for that customer.
  alsoCustomerOf: string[];
};

// Powers the typeahead when starting a sale — name or email, whichever
// matches. Scoped to this artist only; the cross-artist awareness is a
// separate, deliberately lightweight thing (see alsoCustomerOf above),
// not something that leaks into search results.
export async function searchCustomers(
  artistId: string,
  query: string
): Promise<CustomerSummary[]> {
  const q = query.trim();
  if (!q) return [];
  const rows = await db.customer.findMany({
    where: {
      artistId,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      kind: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      relationshipStatus: true,
    },
    orderBy: { name: "asc" },
    take: 10,
  });
  return rows.map((r) => ({ ...r, kind: r.kind as CustomerKind }));
}

export async function listCustomers(artistId: string): Promise<
  (CustomerSummary & { saleCount: number })[]
> {
  const rows = await db.customer.findMany({
    // Customers page is Individual-only now (2026-08-14) — Galleries
    // moved to their own page/section since the two are diverging in
    // what they need (galleries: relationship status, consignment,
    // socials; individuals: none of that).
    where: { artistId, kind: "INDIVIDUAL" },
    select: {
      id: true,
      kind: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      relationshipStatus: true,
      _count: { select: { purchases: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as CustomerKind,
    name: r.name,
    email: r.email,
    phone: r.phone,
    address: r.address,
    relationshipStatus: r.relationshipStatus,
    saleCount: r._count.purchases,
  }));
}

export async function listGalleries(artistId: string): Promise<CustomerSummary[]> {
  const rows = await db.customer.findMany({
    where: { artistId, kind: "GALLERY" },
    select: {
      id: true,
      kind: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      relationshipStatus: true,
    },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ ...r, kind: r.kind as CustomerKind }));
}

export async function getCustomerDetail(customerId: string): Promise<CustomerDetail | null> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: {
      purchases: {
        include: {
          artwork: {
            select: {
              presentationTitle: true,
              medium: true,
              size: true,
              description: true,
              mainImage: { select: { url: true, thumbnailKey: true } },
              images: { take: 1, select: { url: true, thumbnailKey: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!customer) return null;

  // Cross-artist match by email — deliberately excludes this customer's
  // own artist, and only ever returns the other artist's name.
  let alsoCustomerOf: string[] = [];
  if (customer.email) {
    const matches = await db.customer.findMany({
      where: {
        email: { equals: customer.email, mode: "insensitive" },
        artistId: { not: customer.artistId },
      },
      select: { artist: { select: { name: true } } },
      distinct: ["artistId"],
    });
    alsoCustomerOf = matches.map((m) => m.artist.name);
  }

  return {
    id: customer.id,
    kind: customer.kind as CustomerKind,
    name: customer.name,
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    contactName: customer.contactName,
    contactEmail: customer.contactEmail,
    websiteName: customer.websiteName,
    websiteUrl: customer.websiteUrl,
    instagramUrl: customer.instagramUrl,
    facebookUrl: customer.facebookUrl,
    defaultCommissionPercent: customer.defaultCommissionPercent
      ? customer.defaultCommissionPercent.toString()
      : null,
    relationshipStatus: customer.relationshipStatus,
    language: customer.language,
    notes: customer.notes,
    createdAt: customer.createdAt.toISOString(),
    purchases: customer.purchases.map((p) => {
      // Prefers the chosen main image over whatever was returned first
      // (2026-08-16, same pattern as listArtworks).
      const effectiveImage = p.artwork.mainImage || p.artwork.images[0];
      return {
        id: p.id,
        artworkId: p.artworkId,
        artworkTitle: p.artwork.presentationTitle,
        artworkImageUrl: effectiveImage
          ? publicMediaUrl(effectiveImage.thumbnailKey) || effectiveImage.url
          : null,
        artworkMedium: p.artwork.medium,
        artworkSize: p.artwork.size,
        artworkDescription: p.artwork.description,
        totalAmount: p.totalAmount.toString(),
        currency: p.currency,
        status: p.status,
        channel: p.channel,
        createdAt: p.createdAt.toISOString(),
      };
    }),
    alsoCustomerOf,
  };
}

export type GalleryConsignedWork = {
  id: string;
  presentationTitle: string;
  presentationPrice: string | null;
  description: string | null;
  medium: string | null;
  size: string | null;
  imageUrl: string | null;
};

export type GalleryDetail = CustomerDetail & { consignedWorks: GalleryConsignedWork[] };

// Consigned Works is a first cut (2026-08-14): matched by exact string
// equality between this gallery's name and Artwork.location — the same
// free-text field and matching already used by the Artwork Catalogue's
// own Location filter, not a new mechanism. That means a typo or a
// gallery rename can silently break the match (already visible in real
// data — "La Galerie" vs "La Galarie"). Deliberately not fixed here per
// explicit instruction to validate the workflow before investing more.
export async function getGalleryDetail(customerId: string): Promise<GalleryDetail | null> {
  const detail = await getCustomerDetail(customerId);
  if (!detail || detail.kind !== "GALLERY") return null;

  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { artistId: true },
  });
  if (!customer) return null;

  const works = await db.artwork.findMany({
    where: { artistId: customer.artistId, location: detail.name },
    select: {
      id: true,
      presentationTitle: true,
      presentationPrice: true,
      description: true,
      medium: true,
      size: true,
      mainImage: { select: { url: true, thumbnailKey: true } },
      images: { take: 1, select: { url: true, thumbnailKey: true } },
    },
    orderBy: { presentationTitle: "asc" },
  });

  return {
    ...detail,
    consignedWorks: works.map((w) => {
      // Prefers the chosen main image over whatever was returned first
      // (2026-08-16, same pattern as listArtworks).
      const effectiveImage = w.mainImage || w.images[0];
      return {
        id: w.id,
        presentationTitle: w.presentationTitle,
        presentationPrice: w.presentationPrice ? w.presentationPrice.toString() : null,
        description: w.description,
        medium: w.medium,
        size: w.size,
        imageUrl: effectiveImage
          ? publicMediaUrl(effectiveImage.thumbnailKey) || effectiveImage.url
          : null,
      };
    }),
  };
}

// Used when starting a sale — reuses an existing customer if the typed
// email already matches one for this artist (avoiding accidental
// duplicates for the same real person), otherwise creates a new one.
// Name-only entries (no email) always create new, since name alone
// isn't a safe enough match.
//
// 2026-08-16 fix: an explicit `customerId` (set when the person actually
// picks a result from CustomerPicker, rather than just typing a name)
// is now authoritative and skips the name/email matching entirely. Before
// this, picking an existing customer only copied their name/email/address
// into the form's free-text fields — if that customer had no email on
// file (common for a past/offline sale that predates this feature, or
// any gallery-only contact), the email-match below would find nothing
// and silently create a second, blank-ish duplicate of someone already
// selected by name. Verified against `artistId` so a stale or foreign id
// can never attach a sale to the wrong artist's customer.
export async function findOrCreateCustomer(
  artistId: string,
  data: { name: string; email?: string | null; address?: string | null; customerId?: string | null }
): Promise<{ id: string }> {
  if (data.customerId) {
    const picked = await db.customer.findFirst({
      where: { id: data.customerId, artistId },
      select: { id: true },
    });
    if (picked) return { id: picked.id };
    // Falls through to the usual matching/create path if the id somehow
    // doesn't resolve (e.g. deleted between selecting and submitting) —
    // better to create a sane record than to fail the whole sale.
  }

  const email = data.email?.trim() || null;
  if (email) {
    const existing = await db.customer.findFirst({
      where: { artistId, email: { equals: email, mode: "insensitive" } },
    });
    if (existing) return { id: existing.id };
  }

  const created = await db.customer.create({
    data: {
      artistId,
      name: data.name.trim(),
      email,
      address: data.address?.trim() || null,
    },
  });
  return { id: created.id };
}

export async function createCustomer(
  artistId: string,
  formData: FormData
): Promise<{ id: string } | { error: string }> {
  const kindRaw = (formData.get("kind") as string)?.trim();
  const kind = kindRaw === "GALLERY" ? "GALLERY" : "INDIVIDUAL";
  // Individuals submit firstName/lastName and no `name` at all; Galleries
  // (which have no first/last concept) submit `name` directly. Whichever
  // arrives, `name` ends up as the single source of truth used
  // everywhere else (2026-08-14) — nothing downstream needs to know
  // which path built it.
  const firstName = (formData.get("firstName") as string)?.trim() || null;
  const lastName = (formData.get("lastName") as string)?.trim() || null;
  const nameRaw = (formData.get("name") as string)?.trim();
  const name = firstName || lastName ? [firstName, lastName].filter(Boolean).join(" ") : nameRaw;
  if (!name) return { error: "Name is required." };
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const address = (formData.get("address") as string)?.trim() || null;
  const language = (formData.get("language") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const contactName = (formData.get("contactName") as string)?.trim() || null;
  const contactEmail = (formData.get("contactEmail") as string)?.trim() || null;
  const websiteName = (formData.get("websiteName") as string)?.trim() || null;
  const websiteUrl = (formData.get("websiteUrl") as string)?.trim() || null;
  const instagramUrl = (formData.get("instagramUrl") as string)?.trim() || null;
  const facebookUrl = (formData.get("facebookUrl") as string)?.trim() || null;
  const defaultCommissionRaw = (formData.get("defaultCommissionPercent") as string)?.trim();
  const defaultCommissionPercent = defaultCommissionRaw ? parseFloat(defaultCommissionRaw) : null;
  // New galleries start life as a Prospect — nothing to approach yet for
  // an Individual, so left null there (2026-08-14).
  const relationshipStatus = kind === "GALLERY" ? "PROSPECT" : null;

  const created = await db.customer.create({
    data: {
      artistId,
      kind,
      name,
      firstName: kind === "INDIVIDUAL" ? firstName : null,
      lastName: kind === "INDIVIDUAL" ? lastName : null,
      email,
      phone,
      address,
      language,
      notes,
      contactName,
      contactEmail,
      websiteName,
      websiteUrl,
      instagramUrl,
      facebookUrl,
      defaultCommissionPercent,
      relationshipStatus,
    },
  });
  revalidatePath(`/sites`);
  return { id: created.id };
}

export async function updateCustomer(customerId: string, formData: FormData): Promise<void> {
  const kindRaw = (formData.get("kind") as string)?.trim();
  const kind = kindRaw === "GALLERY" ? "GALLERY" : "INDIVIDUAL";
  const firstName = (formData.get("firstName") as string)?.trim() || null;
  const lastName = (formData.get("lastName") as string)?.trim() || null;
  const nameRaw = (formData.get("name") as string)?.trim();
  const name =
    kind === "INDIVIDUAL" && (firstName || lastName)
      ? [firstName, lastName].filter(Boolean).join(" ")
      : nameRaw;
  if (!name) return;
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const address = (formData.get("address") as string)?.trim() || null;
  const languageRaw = (formData.get("language") as string)?.trim();
  const language = languageRaw === "EN" || languageRaw === "FR" ? languageRaw : null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const contactName = (formData.get("contactName") as string)?.trim() || null;
  const contactEmail = (formData.get("contactEmail") as string)?.trim() || null;
  const websiteName = (formData.get("websiteName") as string)?.trim() || null;
  const websiteUrl = (formData.get("websiteUrl") as string)?.trim() || null;
  const instagramUrl = (formData.get("instagramUrl") as string)?.trim() || null;
  const facebookUrl = (formData.get("facebookUrl") as string)?.trim() || null;
  const defaultCommissionRaw = (formData.get("defaultCommissionPercent") as string)?.trim();
  const defaultCommissionPercent = defaultCommissionRaw ? parseFloat(defaultCommissionRaw) : null;
  const relationshipStatusRaw = (formData.get("relationshipStatus") as string)?.trim();
  const relationshipStatus =
    relationshipStatusRaw === "PROSPECT" || relationshipStatusRaw === "ACTIVE"
      ? relationshipStatusRaw
      : null;

  await db.customer.update({
    where: { id: customerId },
    data: {
      kind,
      name,
      firstName: kind === "INDIVIDUAL" ? firstName : null,
      lastName: kind === "INDIVIDUAL" ? lastName : null,
      email,
      phone,
      address,
      language,
      notes,
      contactName,
      contactEmail,
      websiteName,
      websiteUrl,
      instagramUrl,
      facebookUrl,
      defaultCommissionPercent,
      relationshipStatus,
    },
  });
  revalidatePath(`/sites`);
}

// Simple hard delete, no soft-delete/archive step — same "lower stakes,
// simple confirm-and-remove" precedent as Artwork delete, not the
// heavier Sites-style archive (2026-08-16, added specifically to let
// duplicate/junk contacts be tidied up, e.g. ones created before the
// customerId fix above existed).
//
// Safe by construction, not by extra checks here: `Purchase.customerId`
// is `ON DELETE SET NULL` at the database level (see the
// 2026-08-13_customer_records migration), and a Purchase's own
// buyerName/buyerEmail/buyerAddress are separately snapshotted at the
// time of sale, never read from the live Customer record — so deleting
// a Customer can only ever unlink it from its past sales, never delete
// or alter a sale itself. The UI still surfaces the sale count before
// deleting so it's an informed choice, not a hidden one.
export async function deleteCustomer(customerId: string): Promise<void> {
  await db.customer.delete({ where: { id: customerId } });
  revalidatePath(`/sites`);
}
