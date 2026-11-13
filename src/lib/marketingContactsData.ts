import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import {
  WORKS_TYPES,
  type MarketingContactRow,
  type MarketingContactType,
  type MarketingCurrency,
  type MarketingWorksType,
} from "@/lib/marketingContacts";

// Reading Administration → Contacts' contacts (2026-11-13, moved out of
// lib/actions/marketingContacts.ts). Plain server code, not "use server":
// the admin's actions check who's asking; the shared Galleries page
// (/shared/galleries/[token]) checks its link.

export const CONTACT_SELECT = {
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

export function toContactRow(c: Stored): MarketingContactRow {
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

// The shared Galleries link (2026-11-13, Craig): view only, for colleagues,
// galleries and nothing else. Its token is secret; making a new one cuts
// off the old link.
export function newGalleriesShareToken(): string {
  return randomBytes(24).toString("base64url");
}

// The galleries, by name — only for the current link's token.
export async function readSharedGalleries(token: string): Promise<MarketingContactRow[] | null> {
  if (!token) return null;
  const settings = await db.platformSettings.findFirst({ where: { galleriesShareToken: token }, select: { id: true } });
  if (!settings) return null;
  const rows = await db.marketingContact.findMany({
    where: { type: "GALLERY" },
    select: CONTACT_SELECT,
    orderBy: { name: "asc" },
  });
  return rows.map(toContactRow);
}
