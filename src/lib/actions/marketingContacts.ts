"use server";

import { requireAdmin } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { findArtistsPage, readArtists } from "@/lib/artistFinder";
import { findPrices } from "@/lib/priceFinder";
import type { Prisma } from "@/generated/prisma/client";
import {
  CURRENCIES,
  PRICE_BANDS,
  WORKS_TYPES,
  type MarketingArtistFind,
  type MarketingArtistsPage,
  type MarketingContactInput,
  type MarketingContactLinkRef,
  type MarketingContactRow,
  type MarketingContactType,
  type MarketingCurrency,
  type MarketingImportResult,
  type MarketingImportRow,
  type MarketingPriceFind,
  type MarketingWorksType,
} from "@/lib/marketingContacts";

// Administration → Contacts (2026-11-04, Craig's request): the platform's
// own marketing list of artists and galleries — see MarketingContact.
// Admin only. A gallery lists its artists and an artist their galleries
// (MarketingContactLink, 2026-11-04); a name added that isn't yet a
// contact of that type becomes one. Contacts also have a contact person,
// price bands for originals and prints, works types and tags
// (2026-11-06) — a tag added that doesn't exist yet is created, and one
// no contact has any more goes.
// Contacts can also be imported from a CSV (2026-11-06), and their price
// bands found from their shop pages (2026-11-07, see priceFinder.ts), and
// a gallery's artists looked up on its website (artistFinder.ts).

const MAX_FIELD = 300;
const MAX_NOTES = 5000;
const MAX_URL = 2000;
const WEB_ADDRESS = /^https?:\/\/\S+$/i;
const MAX_LINKS = 500;
const MAX_TAGS = 50;
const MAX_PRICE = 100_000_000;
// Each row takes about half a second to save, so a call stays well
// inside the server's 30-second limit (2026-11-07: 80 rows at once
// timed out).
const MAX_IMPORT_BATCH = 10;
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
  shopUrl: true,
  photoUrl: true,
  instagram: true,
  tiktok: true,
  town: true,
  country: true,
  notes: true,
  originalsMin: true,
  originalsMax: true,
  printsMin: true,
  printsMax: true,
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
  shopUrl: string | null;
  photoUrl: string | null;
  instagram: string | null;
  tiktok: string | null;
  town: string | null;
  country: string | null;
  notes: string | null;
  originalsMin: number | null;
  originalsMax: number | null;
  printsMin: number | null;
  printsMax: number | null;
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
    shopUrl: c.shopUrl ?? "",
    photoUrl: c.photoUrl ?? "",
    instagram: c.instagram ?? "",
    tiktok: c.tiktok ?? "",
    town: c.town ?? "",
    country: c.country ?? "",
    notes: c.notes ?? "",
    originalsMin: c.originalsMin,
    originalsMax: c.originalsMax,
    printsMin: c.printsMin,
    printsMax: c.printsMax,
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

type Prices = Pick<
  MarketingContactInput,
  "originalsMin" | "originalsMax" | "printsMin" | "printsMax" | "priceCurrency"
>;

const tidyPrices = (input: Prices) => ({
  originalsMin: price(input.originalsMin),
  originalsMax: price(input.originalsMax),
  printsMin: price(input.printsMin),
  printsMax: price(input.printsMax),
});

// The prices' currency — needed when there are any — or what's wrong
// with the bands.
function checkedPrices(
  prices: ReturnType<typeof tidyPrices>,
  currency: unknown,
): { error: string } | { currency: MarketingCurrency | null } {
  for (const band of PRICE_BANDS) {
    const [min, max] = [prices[band.min], prices[band.max]];
    if (min !== null && max !== null && min > max)
      return { error: `${band.label}: the lowest price is above the highest.` };
  }
  const known = CURRENCIES.includes(currency as MarketingCurrency) ? (currency as MarketingCurrency) : null;
  if (Object.values(prices).some((p) => p !== null) && !known) return { error: "Choose the prices' currency." };
  return { currency: known };
}

// What was typed, checked and tidied — or what's wrong with it.
function checked(input: MarketingContactInput) {
  if (input.type !== "GALLERY" && input.type !== "ARTIST") return { error: "Choose Gallery or Artist." };
  const name = text(input.name);
  if (!name) return { error: "A name is needed." };
  const email = text(input.email)?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) return { error: "That email doesn't look right." };
  const prices = tidyPrices(input);
  const photoUrl = text(input.photoUrl, MAX_URL);
  if (photoUrl && !WEB_ADDRESS.test(photoUrl)) return { error: "The photo needs a full web address (https://…)." };
  const shopUrl = text(input.shopUrl, MAX_URL);
  if (shopUrl && !WEB_ADDRESS.test(shopUrl)) return { error: "The shop page needs a full web address (https://…)." };
  const priceCurrency = checkedPrices(prices, input.priceCurrency);
  if ("error" in priceCurrency) return { error: priceCurrency.error };
  const worksTypes = WORKS_TYPES.filter((w) => Array.isArray(input.worksTypes) && input.worksTypes.includes(w));
  return {
    data: {
      type: input.type,
      name,
      contactPerson: text(input.contactPerson),
      email,
      phone: text(input.phone),
      website: text(input.website),
      shopUrl,
      photoUrl,
      instagram: text(input.instagram),
      tiktok: text(input.tiktok),
      town: text(input.town),
      country: text(input.country),
      notes: text(input.notes, MAX_NOTES),
      ...prices,
      priceCurrency: priceCurrency.currency,
      worksTypes,
    },
    links: refs(input.links, MAX_LINKS),
    tags: refs(input.tags, MAX_TAGS),
  };
}

// The ids of these tags — each an existing tag, else one of that name
// (ignoring capitals), else a new one.
async function tagIds(tx: Prisma.TransactionClient, tags: MarketingContactLinkRef[]) {
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
  return [...ids];
}

// Gives a contact these tags, as well as any it has.
async function addTags(tx: Prisma.TransactionClient, contactId: string, tags: MarketingContactLinkRef[]) {
  const ids = await tagIds(tx, tags);
  await tx.marketingContactTag.createMany({
    data: ids.map((tagId) => ({ contactId, tagId })),
    skipDuplicates: true,
  });
  return ids;
}

// Sets a contact's tags to these.
async function setTags(tx: Prisma.TransactionClient, contactId: string, tags: MarketingContactLinkRef[]) {
  const ids = await addTags(tx, contactId, tags);
  await tx.marketingContactTag.deleteMany({ where: { contactId, tagId: { notIn: ids } } });
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

// A website as one site, whatever way it was typed:
// "https://www.Gallery.com/contact" → "gallery.com".
const siteKey = (v: string | null) =>
  v
    ?.toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0] || null;

// An imported row's prices for a contact already there: all of them if
// it has none; otherwise, in the same currency, any band it hasn't got;
// otherwise none.
function mergedPrices(old: Prices, row: Prices): Partial<Prices> {
  const has = (p: Prices, band: (typeof PRICE_BANDS)[number]) => p[band.min] !== null || p[band.max] !== null;
  if (!PRICE_BANDS.some((b) => has(old, b))) {
    const { originalsMin, originalsMax, printsMin, printsMax, priceCurrency } = row;
    return { originalsMin, originalsMax, printsMin, printsMax, priceCurrency };
  }
  if (old.priceCurrency !== row.priceCurrency) return {};
  return Object.fromEntries(
    PRICE_BANDS.filter((b) => !has(old, b)).flatMap((b) => [
      [b.min, row[b.min]],
      [b.max, row[b.max]],
    ]),
  );
}

// Imports CSV rows (up to MAX_IMPORT_BATCH a call — the screen sends
// them in batches). A row matching a contact of its type is merged: what
// the contact has is kept, its blanks are filled in, and the row's works
// types and tags are added. It matches a contact with the same email; or,
// on the same website, one where either has no email — so branches of
// one gallery sharing a website but with their own emails stay separate
// (2026-11-06). Any other row is added as a new contact. A row that
// can't be saved is skipped, with why.
export async function importMarketingContacts(rows: MarketingImportRow[]): Promise<MarketingImportResult> {
  await requireAdmin();
  const result: MarketingImportResult = { created: 0, merged: 0, skipped: [] };

  // Every contact's email and site, to match against — added to as
  // rows are created, so a file can't add the same gallery twice.
  const known = await db.marketingContact.findMany({ select: { id: true, type: true, email: true, website: true } });
  const byEmail = new Map<string, string>();
  const bySite = new Map<string, { id: string; email: string | null }[]>();
  const remember = (c: { id: string; type: MarketingContactType; email: string | null; website: string | null }) => {
    if (c.email) byEmail.set(`${c.type}:${c.email.toLowerCase()}`, c.id);
    const site = siteKey(c.website);
    if (!site) return;
    const key = `${c.type}:${site}`;
    const others = (bySite.get(key) ?? []).filter((s) => s.id !== c.id);
    bySite.set(key, [...others, { id: c.id, email: c.email }]);
  };
  known.forEach(remember);

  for (const { line, contact } of rows.slice(0, MAX_IMPORT_BATCH)) {
    const check = checked({ ...contact, links: [] });
    if ("error" in check) {
      result.skipped.push({ line, reason: check.error! });
      continue;
    }
    const { data, tags } = check;
    const site = siteKey(data.website);
    const sameSite = site ? (bySite.get(`${data.type}:${site}`) ?? []) : [];
    const matchId =
      (data.email && byEmail.get(`${data.type}:${data.email}`)) ||
      sameSite.find((s) => !data.email || !s.email)?.id ||
      null;

    if (matchId) {
      const merged = await db.$transaction(async (tx) => {
        const old = await tx.marketingContact.findUniqueOrThrow({ where: { id: matchId } });
        const c = await tx.marketingContact.update({
          where: { id: matchId },
          select: { id: true, type: true, email: true, website: true },
          data: {
            contactPerson: old.contactPerson ?? data.contactPerson,
            email: old.email ?? data.email,
            phone: old.phone ?? data.phone,
            website: old.website ?? data.website,
            shopUrl: old.shopUrl ?? data.shopUrl,
            photoUrl: old.photoUrl ?? data.photoUrl,
            instagram: old.instagram ?? data.instagram,
            tiktok: old.tiktok ?? data.tiktok,
            town: old.town ?? data.town,
            country: old.country ?? data.country,
            notes: old.notes ?? data.notes,
            ...mergedPrices(old, data),
            worksTypes: WORKS_TYPES.filter((w) => old.worksTypes.includes(w) || data.worksTypes.includes(w)),
          },
        });
        await addTags(tx, matchId, tags);
        return c;
      });
      remember(merged);
      result.merged++;
    } else {
      const created = await db.$transaction(async (tx) => {
        const c = await tx.marketingContact.create({
          data,
          select: { id: true, type: true, email: true, website: true },
        });
        await addTags(tx, c.id, tags);
        return c;
      });
      remember(created);
      result.created++;
    }
  }
  return result;
}

// Find prices (2026-11-07): what a contact's shop page (or website)
// suggests for its price bands — `viaService` reads it through the
// page-reading service. Saves nothing — see saveMarketingPrices.
export async function findMarketingPrices(id: string, viaService = false): Promise<MarketingPriceFind> {
  await requireAdmin();
  const contact = await db.marketingContact.findUnique({
    where: { id },
    select: { shopUrl: true, website: true, country: true, priceCurrency: true },
  });
  if (!contact) return { found: false, reason: "That contact has gone." };
  return findPrices(contact, viaService);
}

// Saves a contact's price bands and their currency — what Find prices
// suggested, as accepted. Returns the contact as it is now.
export async function saveMarketingPrices(
  id: string,
  input: Prices,
): Promise<{ contact: MarketingContactRow } | { error: string }> {
  await requireAdmin();
  const prices = tidyPrices(input);
  const currency = checkedPrices(prices, input.priceCurrency);
  if ("error" in currency) return { error: currency.error };
  const saved = await db.marketingContact.updateMany({
    where: { id },
    data: { ...prices, priceCurrency: currency.currency },
  });
  if (saved.count === 0) return { error: "That contact has gone." };
  return { contact: toRow(await db.marketingContact.findUniqueOrThrow({ where: { id }, select })) };
}

// A gallery's artists, as its website lists them (2026-11-07), in two
// steps (see artistFinder.ts): where its artists page is, then the
// artists on it. `viaService` reads the site through the page-reading
// service. Saves nothing.
export async function findGalleryArtistsPage(id: string, viaService = false): Promise<MarketingArtistsPage> {
  await requireAdmin();
  const contact = await db.marketingContact.findUnique({ where: { id }, select: { website: true, shopUrl: true } });
  if (!contact) return { found: false, reason: "That contact has gone." };
  return findArtistsPage(contact, viaService);
}

export async function readGalleryArtists(
  id: string,
  pageUrl: string | null,
  shopify: boolean,
  viaService = false,
): Promise<MarketingArtistFind> {
  await requireAdmin();
  const contact = await db.marketingContact.findUnique({ where: { id }, select: { website: true, shopUrl: true } });
  if (!contact) return { found: false, reason: "That contact has gone." };
  return readArtists(contact, pageUrl, shopify, viaService);
}
