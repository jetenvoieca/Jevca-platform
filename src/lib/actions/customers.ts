"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

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
    where: { artistId },
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

export async function getCustomerDetail(customerId: string): Promise<CustomerDetail | null> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: {
      purchases: {
        include: { artwork: { select: { presentationTitle: true } } },
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
    purchases: customer.purchases.map((p) => ({
      id: p.id,
      artworkId: p.artworkId,
      artworkTitle: p.artwork.presentationTitle,
      totalAmount: p.totalAmount.toString(),
      currency: p.currency,
      status: p.status,
      channel: p.channel,
      createdAt: p.createdAt.toISOString(),
    })),
    alsoCustomerOf,
  };
}

// Used when starting a sale — reuses an existing customer if the typed
// email already matches one for this artist (avoiding accidental
// duplicates for the same real person), otherwise creates a new one.
// Name-only entries (no email) always create new, since name alone
// isn't a safe enough match.
export async function findOrCreateCustomer(
  artistId: string,
  data: { name: string; email?: string | null; address?: string | null }
): Promise<{ id: string }> {
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
  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Name is required." };
  const kindRaw = (formData.get("kind") as string)?.trim();
  const kind = kindRaw === "GALLERY" ? "GALLERY" : "INDIVIDUAL";
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
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;
  const kindRaw = (formData.get("kind") as string)?.trim();
  const kind = kindRaw === "GALLERY" ? "GALLERY" : "INDIVIDUAL";
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
