"use server";

import { requireAdmin } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { isOriginalType } from "@/lib/derivatives";
import { revalidatePath } from "next/cache";

// Tidying the catalogue (2026-11-05, Craig's request; admin only): each
// work that isn't an Original and isn't yet "Derived from" anything is
// linked to the Original of the same name (capitals and spaces at the
// ends ignored), and that Original is ticked Base, so Make / View
// Derivatives work on it. A name with more than one Original is left
// alone and listed, to sort by hand. Shown first (preview), then done.

export type DerivativeLink = {
  id: string;
  name: string;
  catalogueNumber: string;
  type: string | null;
  originalId: string;
  originalNumber: string;
};

export type DerivativeLinkPlan = {
  links: DerivativeLink[];
  // Names with more than one Original: how many Originals, and how many
  // works would need one.
  unclear: { name: string; originals: number; works: number }[];
  // Works with no Original of their name (listed 2026-11-05, to sort by
  // hand).
  noOriginal: { id: string; name: string; catalogueNumber: string; type: string | null }[];
};

const key = (name: string) => name.trim().toLowerCase();

async function plan(artistId: string): Promise<DerivativeLinkPlan> {
  const works = await db.artwork.findMany({
    where: { artistId },
    select: { id: true, catalogueName: true, catalogueNumber: true, type: true, derivedFromId: true },
    orderBy: { catalogueName: "asc" },
  });
  const originals = new Map<string, { id: string; catalogueNumber: string }[]>();
  for (const w of works) {
    if (!isOriginalType(w.type)) continue;
    const list = originals.get(key(w.catalogueName)) ?? [];
    list.push({ id: w.id, catalogueNumber: w.catalogueNumber });
    originals.set(key(w.catalogueName), list);
  }

  const links: DerivativeLink[] = [];
  const unclear = new Map<string, { name: string; originals: number; works: number }>();
  const noOriginal: DerivativeLinkPlan["noOriginal"] = [];
  for (const w of works) {
    if (isOriginalType(w.type) || w.derivedFromId) continue;
    const found = originals.get(key(w.catalogueName)) ?? [];
    if (found.length === 1) {
      links.push({
        id: w.id,
        name: w.catalogueName,
        catalogueNumber: w.catalogueNumber,
        type: w.type,
        originalId: found[0].id,
        originalNumber: found[0].catalogueNumber,
      });
    } else if (found.length > 1) {
      const entry = unclear.get(key(w.catalogueName)) ?? { name: w.catalogueName, originals: found.length, works: 0 };
      entry.works++;
      unclear.set(key(w.catalogueName), entry);
    } else {
      noOriginal.push({ id: w.id, name: w.catalogueName, catalogueNumber: w.catalogueNumber, type: w.type });
    }
  }
  return { links, unclear: [...unclear.values()], noOriginal };
}

export async function previewDerivativeLinks(artistId: string): Promise<DerivativeLinkPlan> {
  await requireAdmin();
  return plan(artistId);
}

// Makes the links the preview showed — worked out afresh, so nothing
// changed since is linked wrongly.
export async function applyDerivativeLinks(siteId: string, artistId: string): Promise<{ linked: number; bases: number }> {
  await requireAdmin();
  const { links } = await plan(artistId);
  const byOriginal = new Map<string, string[]>();
  for (const l of links) byOriginal.set(l.originalId, [...(byOriginal.get(l.originalId) ?? []), l.id]);
  await db.$transaction([
    ...[...byOriginal].map(([originalId, ids]) =>
      db.artwork.updateMany({ where: { id: { in: ids }, artistId, derivedFromId: null }, data: { derivedFromId: originalId } }),
    ),
    db.artwork.updateMany({ where: { id: { in: [...byOriginal.keys()] }, artistId }, data: { isBase: true } }),
  ]);
  revalidatePath(`/sites/${siteId}/artworks`);
  return { linked: links.length, bases: byOriginal.size };
}
