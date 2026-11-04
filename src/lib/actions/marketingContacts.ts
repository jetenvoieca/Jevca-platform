"use server";

import { requireAdmin } from "@/lib/currentUser";
import { db } from "@/lib/db";

// Administration → Contacts (2026-11-04, Craig's request): the platform's
// own marketing list of artists and galleries — see MarketingContact.
// Admin only.

export type MarketingContactType = "GALLERY" | "ARTIST";

export type MarketingContactInput = {
  type: MarketingContactType;
  name: string;
  email: string;
  phone: string;
  website: string;
  instagram: string;
  tiktok: string;
  town: string;
  country: string;
  notes: string;
};

export type MarketingContactRow = MarketingContactInput & { id: string };

const MAX_FIELD = 300;
const MAX_NOTES = 5000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const select = {
  id: true,
  type: true,
  name: true,
  email: true,
  phone: true,
  website: true,
  instagram: true,
  tiktok: true,
  town: true,
  country: true,
  notes: true,
} as const;

type Stored = { [K in keyof MarketingContactInput]: K extends "type" | "name" ? MarketingContactInput[K] : string | null } & {
  id: string;
};

function toRow(c: Stored): MarketingContactRow {
  return {
    id: c.id,
    type: c.type,
    name: c.name,
    email: c.email ?? "",
    phone: c.phone ?? "",
    website: c.website ?? "",
    instagram: c.instagram ?? "",
    tiktok: c.tiktok ?? "",
    town: c.town ?? "",
    country: c.country ?? "",
    notes: c.notes ?? "",
  };
}

// Every contact, by name.
export async function listMarketingContacts(): Promise<MarketingContactRow[]> {
  await requireAdmin();
  const rows = await db.marketingContact.findMany({ select, orderBy: { name: "asc" } });
  return rows.map(toRow);
}

// What was typed, checked and tidied — or what's wrong with it.
function checked(input: MarketingContactInput) {
  const text = (v: unknown, max = MAX_FIELD) => (typeof v === "string" ? v.trim().slice(0, max) : "") || null;
  if (input.type !== "GALLERY" && input.type !== "ARTIST") return { error: "Choose Gallery or Artist." };
  const name = text(input.name);
  if (!name) return { error: "A name is needed." };
  const email = text(input.email)?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) return { error: "That email doesn't look right." };
  return {
    data: {
      type: input.type,
      name,
      email,
      phone: text(input.phone),
      website: text(input.website),
      instagram: text(input.instagram),
      tiktok: text(input.tiktok),
      town: text(input.town),
      country: text(input.country),
      notes: text(input.notes, MAX_NOTES),
    },
  };
}

// Adds a contact (no `id`) or saves one.
export async function saveMarketingContact(
  id: string | null,
  input: MarketingContactInput,
): Promise<{ contact: MarketingContactRow } | { error: string }> {
  await requireAdmin();
  const result = checked(input);
  if ("error" in result) return { error: result.error! };
  const contact = id
    ? await db.marketingContact.update({ where: { id }, data: result.data, select })
    : await db.marketingContact.create({ data: result.data, select });
  return { contact: toRow(contact) };
}

export async function deleteMarketingContact(id: string): Promise<{ ok: true }> {
  await requireAdmin();
  await db.marketingContact.deleteMany({ where: { id } });
  return { ok: true };
}
