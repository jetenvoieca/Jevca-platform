"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { createCustomer, type CustomerKind, type CustomerSummary } from "./customers";

export type LocationType = "GALLERY" | "OWN";

export type LocationSummary = {
  id: string;
  name: string;
  type: LocationType;
  customerId: string;
};

// The single canonical list a Location picker offers (2026-09-22) —
// replaces the old free-text Artist.artworkLocations. See the note on
// Location in schema.prisma. Used by the Artwork Catalogue's Location
// dropdown and the Settings screen's Locations card.
export async function listLocations(artistId: string): Promise<LocationSummary[]> {
  const rows = await db.location.findMany({
    where: { artistId },
    select: { id: true, name: true, type: true, customerId: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ ...r, type: r.type as LocationType }));
}

// Same list, but shaped for the Locations page's own left-hand list
// (2026-09-22 rework of the old Galleries page — see GalleriesView.tsx),
// which is keyed by Customer id throughout (openRow, getGalleryDetail,
// startGallerySale, etc. all take a customerId) — reusing that same key
// here means nothing else in that page needs to learn about Location
// ids at all.
export type LocationCustomerSummary = CustomerSummary & { locationType: LocationType };

export async function listLocationCustomers(artistId: string): Promise<LocationCustomerSummary[]> {
  const rows = await db.location.findMany({
    where: { artistId },
    select: {
      type: true,
      customer: {
        select: { id: true, kind: true, name: true, email: true, phone: true, address: true },
      },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.customer.id,
    kind: r.customer.kind as CustomerKind,
    name: r.customer.name,
    email: r.customer.email,
    phone: r.customer.phone,
    address: r.customer.address,
    locationType: r.type as LocationType,
  }));
}

// Looks up a Location by its exact name (2026-09-22) — how the "Sold"
// button on the Artwork Catalogue resolves an artwork's current
// Location string to somewhere it can actually navigate to. Returns
// null for a blank/unmatched name (the caller then prompts to add one
// via createLocation below).
export async function findLocationByName(
  artistId: string,
  name: string
): Promise<LocationSummary | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const row = await db.location.findUnique({
    where: { artistId_name: { artistId, name: trimmed } },
  });
  if (!row) return null;
  return { id: row.id, name: row.name, type: row.type as LocationType, customerId: row.customerId };
}

// Creates a new Location — and its linked Customer record in the same
// call (kind "GALLERY" or "OWN" to match), so the two can never exist
// independently of each other. Reused by the Settings screen's own "+
// Add" row, the Artwork Catalogue's Location dropdown "+ Add new…", and
// the "Sold" button's forced prompt when Location is blank.
export async function createLocation(
  artistId: string,
  siteId: string,
  name: string,
  type: LocationType
): Promise<LocationSummary | { error: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "A name is required." };

  const existing = await db.location.findUnique({
    where: { artistId_name: { artistId, name: trimmed } },
  });
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      type: existing.type as LocationType,
      customerId: existing.customerId,
    };
  }

  const fd = new FormData();
  fd.set("kind", type);
  fd.set("name", trimmed);
  const customer = await createCustomer(artistId, fd);
  if ("error" in customer) return customer;

  const created = await db.location.create({
    data: { artistId, name: trimmed, type, customerId: customer.id },
  });

  revalidatePath(`/sites/${siteId}/artworks/settings`);
  revalidatePath(`/sites/${siteId}/artworks`);
  revalidatePath(`/sites/${siteId}/galleries`);
  return { id: created.id, name: created.name, type, customerId: created.customerId };
}

// Renaming has to cascade everywhere the old name is stored as free
// text (Artwork.location) plus the linked Customer's own name — same
// "typo/rename can silently break the match" issue the old Gallery-name
// matching had (see the old note on getGalleryDetail in
// actions/customers.ts), now fixed by doing the cascade in one place
// instead of leaving it to whichever screen happens to trigger a rename.
export async function renameLocationByCustomer(
  customerId: string,
  siteId: string,
  newNameRaw: string
): Promise<{ ok: true } | { error: string }> {
  const newName = newNameRaw.trim();
  if (!newName) return { error: "A name is required." };
  const loc = await db.location.findUnique({ where: { customerId } });
  if (!loc) return { error: "Location not found." };
  if (loc.name === newName) return { ok: true };

  const clash = await db.location.findUnique({
    where: { artistId_name: { artistId: loc.artistId, name: newName } },
  });
  if (clash) return { error: "Already used by another Location." };

  await db.$transaction([
    db.location.update({ where: { id: loc.id }, data: { name: newName } }),
    db.customer.update({ where: { id: customerId }, data: { name: newName } }),
    db.artwork.updateMany({
      where: { artistId: loc.artistId, location: loc.name },
      data: { location: newName },
    }),
  ]);

  revalidatePath(`/sites/${siteId}/artworks/settings`);
  revalidatePath(`/sites/${siteId}/artworks`);
  revalidatePath(`/sites/${siteId}/galleries`);
  return { ok: true };
}

// Deletes the Location and its linked Customer in one step — same
// one-step "remove the contact record" the old Galleries Delete did;
// sales stay exactly as they are either way (Purchase.customerId is ON
// DELETE SET NULL — see actions/customers.ts). Any Artwork.location
// still holding the deleted name is left as is (same free-text
// tolerance as everywhere else this match is used) — it just won't
// resolve to anywhere until repointed at a real Location.
export async function deleteLocationByCustomer(customerId: string, siteId: string): Promise<void> {
  const loc = await db.location.findUnique({ where: { customerId } });
  if (loc) await db.location.delete({ where: { id: loc.id } });
  await db.customer.delete({ where: { id: customerId } }).catch(() => {});
  revalidatePath(`/sites/${siteId}/artworks/settings`);
  revalidatePath(`/sites/${siteId}/artworks`);
  revalidatePath(`/sites/${siteId}/galleries`);
}

// Settings screen's own delete (keyed by Location id, since that's what
// listLocations above returns) — same underlying action as
// deleteLocationByCustomer, just reached the other way round.
export async function deleteLocation(locationId: string, siteId: string): Promise<void> {
  const loc = await db.location.findUnique({ where: { id: locationId } });
  if (!loc) return;
  await deleteLocationByCustomer(loc.customerId, siteId);
}

// Changes a Location's Type after creation (2026-09-22) — Type used to
// be fixed for good the moment a Location was created (asked once, via
// the "Sold" button's prompt or the Settings "+ Add" row, then never
// editable again), which meant fixing a wrong answer — e.g. a Location
// named "Studio" that's obviously the artist's own, created as GALLERY
// by mistake — had no path except deleting and recreating the whole
// Location, losing whatever Artwork.location cascade/rename history it
// had. This is the fix: updates Location.type and the linked Customer's
// kind together, in one transaction, so the two can never drift apart.
// Every consigned/held Work stays exactly where it is either way — the
// match is by name (Artwork.location), never by Type.
export async function updateLocationType(
  locationId: string,
  siteId: string,
  type: LocationType
): Promise<{ ok: true } | { error: string }> {
  const loc = await db.location.findUnique({ where: { id: locationId } });
  if (!loc) return { error: "Location not found." };
  if (loc.type === type) return { ok: true };

  await db.$transaction([
    db.location.update({ where: { id: locationId }, data: { type } }),
    db.customer.update({ where: { id: loc.customerId }, data: { kind: type } }),
  ]);

  revalidatePath(`/sites/${siteId}/artworks/settings`);
  revalidatePath(`/sites/${siteId}/artworks`);
  revalidatePath(`/sites/${siteId}/galleries`);
  return { ok: true };
}
