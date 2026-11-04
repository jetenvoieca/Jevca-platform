"use server";

import { requireAdmin } from "@/lib/currentUser";
import { db } from "@/lib/db";

// Administration → Contacts (2026-11-04, Craig's request): the platform's
// own marketing list of artists and galleries — see MarketingContact.
// Admin only. A gallery lists its artists and an artist their galleries
// (MarketingContactLink, 2026-11-04); a name added that isn't yet a
// contact of that type becomes one.

export type MarketingContactType = "GALLERY" | "ARTIST";

// A gallery's artist or an artist's gallery: an existing contact (`id`),
// or, when saving, a new name (`id` null).
export type MarketingContactLinkRef = { id: string | null; name: string };

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
  links: MarketingContactLinkRef[];
};

export type MarketingContactRow = Omit<MarketingContactInput, "links"> & {
  id: string;
  links: { id: string; name: string }[];
};

const MAX_FIELD = 300;
const MAX_NOTES = 5000;
const MAX_LINKS = 500;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const otherType = (t: MarketingContactType): MarketingContactType => (t === "GALLERY" ? "ARTIST" : "GALLERY");

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
  artists: { select: { artist: { select: { id: true, name: true } } } },
  galleries: { select: { gallery: { select: { id: true, name: true } } } },
} as const;

type Stored = {
  id: string;
  type: MarketingContactType;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  tiktok: string | null;
  town: string | null;
  country: string | null;
  notes: string | null;
  artists: { artist: { id: string; name: string } }[];
  galleries: { gallery: { id: string; name: string } }[];
};

function toRow(c: Stored): MarketingContactRow {
  const links = c.type === "GALLERY" ? c.artists.map((l) => l.artist) : c.galleries.map((l) => l.gallery);
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
    links: links.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// Every contact, by name.
export async function listMarketingContacts(): Promise<MarketingContactRow[]> {
  await requireAdmin();
  const rows = await db.marketingContact.findMany({ select, orderBy: { name: "asc" } });
  return rows.map(toRow);
}

const text = (v: unknown, max = MAX_FIELD) => (typeof v === "string" ? v.trim().slice(0, max) : "") || null;

// What was typed, checked and tidied — or what's wrong with it.
function checked(input: MarketingContactInput) {
  if (input.type !== "GALLERY" && input.type !== "ARTIST") return { error: "Choose Gallery or Artist." };
  const name = text(input.name);
  if (!name) return { error: "A name is needed." };
  const email = text(input.email)?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) return { error: "That email doesn't look right." };
  const links = (Array.isArray(input.links) ? input.links : []).slice(0, MAX_LINKS).flatMap((l) => {
    const linkName = text(l?.name);
    return linkName ? [{ id: typeof l.id === "string" && l.id ? l.id : null, name: linkName }] : [];
  });
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
    links,
  };
}

// Adds a contact (no `id`) or saves one, with its links — a name not yet
// a contact of the other type (matched ignoring capitals) is added as
// one. Returns every contact, as the links change the others too.
export async function saveMarketingContact(
  id: string | null,
  input: MarketingContactInput,
): Promise<{ contacts: MarketingContactRow[] } | { error: string }> {
  await requireAdmin();
  const result = checked(input);
  if ("error" in result) return { error: result.error! };
  const { data, links } = result;
  const other = otherType(data.type);

  await db.$transaction(async (tx) => {
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
  });

  return { contacts: await listMarketingContacts() };
}

// Deletes a contact and its links — not the contacts it was linked to.
export async function deleteMarketingContact(id: string): Promise<{ ok: true }> {
  await requireAdmin();
  await db.marketingContact.deleteMany({ where: { id } });
  return { ok: true };
}
