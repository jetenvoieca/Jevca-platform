"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type CustomerSummary = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export type CustomerDetail = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
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
    select: { id: true, name: true, email: true, phone: true },
    orderBy: { name: "asc" },
    take: 10,
  });
  return rows;
}

export async function listCustomers(artistId: string): Promise<
  (CustomerSummary & { saleCount: number })[]
> {
  const rows = await db.customer.findMany({
    where: { artistId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      _count: { select: { purchases: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
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
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
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

export async function createCustomer(artistId: string, formData: FormData): Promise<void> {
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const address = (formData.get("address") as string)?.trim() || null;
  const language = (formData.get("language") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  await db.customer.create({
    data: { artistId, name, email, phone, address, language, notes },
  });
  revalidatePath(`/sites`);
}

export async function updateCustomer(customerId: string, formData: FormData): Promise<void> {
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const address = (formData.get("address") as string)?.trim() || null;
  const languageRaw = (formData.get("language") as string)?.trim();
  const language = languageRaw === "EN" || languageRaw === "FR" ? languageRaw : null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  await db.customer.update({
    where: { id: customerId },
    data: { name, email, phone, address, language, notes },
  });
  revalidatePath(`/sites`);
}
