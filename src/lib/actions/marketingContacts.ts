"use server";

import { requireAdmin } from "@/lib/currentUser";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

// Administration → Contacts (2026-11-04, Craig's request): the platform's
// own marketing list of artists and galleries — see MarketingContact.
// Admin only. A gallery lists its artists and an artist their galleries
// (MarketingContactLink, 2026-11-04); a name added that isn't yet a
// contact of that type becomes one. Contacts also have a contact person,
// a price band, works types and tags (2026-11-06) — a tag added that
// doesn't exist yet is created, and one no contact has any more goes.

export type MarketingContactType = "GALLERY" | "ARTIST";
export type MarketingWorksType = "ORIGINALS" | "PRINTS" | "SCULPTURE" | "PHOTOGRAPHY" | "MIXED_MEDIA";
export type MarketingCurrency = "GBP" | "EUR" | "USD";

export const WORKS_TYPES: MarketingWorksType[] = ["ORIGINALS", "PRINTS", "SCULPTURE", "PHOTOGRAPHY", "MIXED_MEDIA"];
export const CURRENCIES: MarketingCurrency[] = ["GBP", "EUR", "USD"];

// A gallery's artist or an artist's gallery, or a tag: an existing one
// (`id`), or, when saving, a new name (`id` null).
export type MarketingContactLinkRef = { id: string | null; name: string };

export type MarketingContactInput = {
  type: MarketingContactType;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  website: string;
  instagram: string;
  tiktok: string;
  town: string;
  country: string;
  notes: string;
  priceMin: number | null;
  priceMax: number | null;
  priceCurrency: MarketingCurrency | null;
  worksTypes: MarketingWorksType[];
  links: MarketingContactLinkRef[];
  tags: MarketingContactLinkRef[];
};

export type MarketingContactRow = Omit<MarketingContactInput, "links" | "tags"> & {
  id: string;
  links: { id: string; name: string }[];
  tags: { id: string; name: string }[];
};

const MAX_FIELD = 300;
const MAX_NOTES = 5000;
const MAX_LINKS = 500;
const MAX_TAGS = 50;
const MAX_PRICE = 100_000_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const otherType = (t: MarketingContactType): MarketingContactType => (t === "GALLERY" ? "ARTIST" : "GALLERY");

const select = {
  id: true,
  type: true,
  name: true,
  contactPerson: true,
  email: true,
  phone: true,
  website: true,
  instagram: true,
  tiktok: true,
  town: true,
  country: true,
  notes: true,
  priceMin: true,
  priceMax: true,
  priceCurrency: true,
  worksTypes: true,
  tags: { select: { tag: { select: { id: true, name: true } } } },
  artists: { select: { artist: { select: { id: true, name: true } } } },
  galleries: { select: { gallery: { select: { id: true, name: true } } } },
} as const;

type Stored = {
  id: string;
  type: MarketingContactType;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  tiktok: string | null;
  town: string | null;
  country: string | null;
  notes: string | null;
  priceMin: number | null;
  priceMax: number | null;
  priceCurrency: MarketingCurrency | null;
  worksTypes: MarketingWorksType[];
  tags: { tag: { id: string; name: string } }[];
  artists: { artist: { id: string; name: string } }[];
  galleries: { gallery: { id: string; name: string } }[];
};

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

function toRow(c: Stored): MarketingContactRow {
  const links = c.type === "GALLERY" ? c.artists.map((l) => l.artist) : c.galleries.map((l) => l.gallery);
  return {
    id: c.id,
    type: c.type,
    name: c.name,
    contactPerson: c.contactPerson ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    website: c.website ?? "",
    instagram: c.instagram ?? "",
    tiktok: c.tiktok ?? "",
    town: c.town ?? "",
    country: c.country ?? "",
    notes: c.notes ?? "",
    priceMin: c.priceMin,
    priceMax: c.priceMax,
    priceCurrency: c.priceCurrency,
    worksTypes: WORKS_TYPES.filter((w) => c.worksTypes.includes(w)),
    links: links.sort(byName),
    tags: c.tags.map((t) => t.tag).sort(byName),
  };
}

// Every contact, by name.
export async function listMarketingContacts(): Promise<MarketingContactRow[]> {
  await requireAdmin();
  const rows = await db.marketingContact.findMany({ select, orderBy: { name: "asc" } });
  return rows.map(toRow);
}

const text = (v: unknown, max = MAX_FIELD) => (typeof v === "string" ? v.trim().slice(0, max) : "") || null;
const price = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), MAX_PRICE) : null;
const refs = (v: unknown, max: number) =>
  (Array.isArray(v) ? v : []).slice(0, max).flatMap((l) => {
    const name = text(l?.name);
    return name ? [{ id: typeof l.id === "string" && l.id ? l.id : null, name }] : [];
  });

// What was typed, checked and tidied — or what's wrong with it.
function checked(input: MarketingContactInput) {
  if (input.type !== "GALLERY" && input.type !== "ARTIST") return { error: "Choose Gallery or Artist." };
  const name = text(input.name);
  if (!name) return { error: "A name is needed." };
  const email = text(input.email)?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) return { error: "That email doesn't look right." };
  const priceMin = price(input.priceMin);
  const priceMax = price(input.priceMax);
  if (priceMin !== null && priceMax !== null && priceMin > priceMax)
    return { error: "The lowest price is above the highest." };
  const priceCurrency = CURRENCIES.includes(input.priceCurrency as MarketingCurrency) ? input.priceCurrency : null;
  if ((priceMin !== null || priceMax !== null) && !priceCurrency) return { error: "Choose the price's currency." };
  const worksTypes = WORKS_TYPES.filter((w) => Array.isArray(input.worksTypes) && input.worksTypes.includes(w));
  return {
    data: {
      type: input.type,
      name,
      contactPerson: text(input.contactPerson),
      email,
      phone: text(input.phone),
      website: text(input.website),
      instagram: text(input.instagram),
      tiktok: text(input.tiktok),
      town: text(input.town),
      country: text(input.country),
      notes: text(input.notes, MAX_NOTES),
      priceMin,
      priceMax,
      priceCurrency,
      worksTypes,
    },
    links: refs(input.links, MAX_LINKS),
    tags: refs(input.tags, MAX_TAGS),
  };
}

// Sets a contact's tags to these — each an existing tag, else one of
// that name (ignoring capitals), else a new one.
async function setTags(tx: Prisma.TransactionClient, contactId: string, tags: MarketingContactLinkRef[]) {
  const ids = new Set<string>();
  for (const tag of tags) {
    const found =
      (tag.id && (await tx.marketingTag.findUnique({ where: { id: tag.id }, select: { id: true } }))) ||
      (await tx.marketingTag.findFirst({
        where: { name: { equals: tag.name, mode: "insensitive" } },
        select: { id: true },
      })) ||
      (await tx.marketingTag.create({ data: { name: tag.name }, select: { id: true } }));
    ids.add(found.id);
  }
  await tx.marketingContactTag.deleteMany({ where: { contactId, tagId: { notIn: [...ids] } } });
  await tx.marketingContactTag.createMany({
    data: [...ids].map((tagId) => ({ contactId, tagId })),
    skipDuplicates: true,
  });
}

// Tags no contact has any more.
async function removeUnusedTags(tx: Prisma.TransactionClient) {
  await tx.marketingTag.deleteMany({ where: { contacts: { none: {} } } });
}

// Adds a contact (no `id`) or saves one, with its links and tags — a
// name not yet a contact of the other type (matched ignoring capitals)
// is added as one. Returns its id and every contact, as the links change the others
// too.
export async function saveMarketingContact(
  id: string | null,
  input: MarketingContactInput,
): Promise<{ id: string; contacts: MarketingContactRow[] } | { error: string }> {
  await requireAdmin();
  const result = checked(input);
  if ("error" in result) return { error: result.error! };
  const { data, links, tags } = result;
  const other = otherType(data.type);

  const savedId = await db.$transaction(async (tx) => {
    const contact = id
      ? await tx.marketingContact.update({ where: { id }, data, select: { id: true } })
      : await tx.marketingContact.create({ data, select: { id: true } });

    const linkedIds = new Set<string>();
    for (const link of links) {
      const found =
        (link.id &&
          (await tx.marketingContact.findFirst({ where: { id: link.id, type: other }, select: { id: true } }))) ||
        (await tx.marketingContact.findFirst({
          where: { type: other, name: { equals: link.name, mode: "insensitive" } },
          select: { id: true },
        })) ||
        (await tx.marketingContact.create({ data: { type: other, name: link.name }, select: { id: true } }));
      linkedIds.add(found.id);
    }
    const ids = [...linkedIds];

    // Its links not kept, and any from when it was the other type, go;
    // the new ones are added.
    const gallery = data.type === "GALLERY";
    await tx.marketingContactLink.deleteMany({
      where: gallery
        ? { OR: [{ artistId: contact.id }, { galleryId: contact.id, artistId: { notIn: ids } }] }
        : { OR: [{ galleryId: contact.id }, { artistId: contact.id, galleryId: { notIn: ids } }] },
    });
    await tx.marketingContactLink.createMany({
      data: ids.map((linked) =>
        gallery ? { galleryId: contact.id, artistId: linked } : { galleryId: linked, artistId: contact.id },
      ),
      skipDuplicates: true,
    });

    await setTags(tx, contact.id, tags);
    await removeUnusedTags(tx);
    return contact.id;
  });

  return { id: savedId, contacts: await listMarketingContacts() };
}

// Deletes a contact, its links and its tags — not the contacts it was
// linked to, nor a tag others still have.
export async function deleteMarketingContact(id: string): Promise<{ ok: true }> {
  await requireAdmin();
  await db.$transaction(async (tx) => {
    await tx.marketingContact.deleteMany({ where: { id } });
    await removeUnusedTags(tx);
  });
  return { ok: true };
}
