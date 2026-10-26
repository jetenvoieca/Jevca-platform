"use server";

import { db } from "@/lib/db";
import { requireArtistAccess, requireRecordAccess } from "@/lib/currentUser";
import { readLocations, type LocationSummary, type LocationType } from "@/lib/artworkSettingsData";
import { revalidatePath } from "next/cache";
import { retireStatementPaymentLinks } from "@/lib/paymentLinks";
import { createCustomer, type CustomerKind, type CustomerSummary } from "./customers";

export type { LocationType, LocationSummary } from "@/lib/artworkSettingsData";

// The single canonical list a Location picker offers — see readLocations.
export async function listLocations(artistId: string): Promise<LocationSummary[]> {
  await requireArtistAccess(artistId);
  return readLocations(artistId);
}

// Same list, but shaped for the Locations page's own left-hand list
// (2026-09-22 rework of the old Galleries page — see GalleriesView.tsx),
// which is keyed by Customer id throughout (openRow, getGalleryDetail,
// startGallerySale, etc. all take a customerId) — reusing that same key
// here means nothing else in that page needs to learn about Location
// ids at all.
export type LocationCustomerSummary = CustomerSummary & { locationType: LocationType };

export async function listLocationCustomers(artistId: string): Promise<LocationCustomerSummary[]> {
  await requireArtistAccess(artistId);
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

// Creates a new Location — and its linked Customer record in the same
// call (kind "GALLERY" or "OWN" to match), so the two can never exist
// independently of each other. Reused by the Settings screen's own "+
// Add" row and the Artwork Catalogue's Location dropdown "+ Add new…".
export async function createLocation(
  artistId: string,
  siteId: string,
  name: string,
  type: LocationType
): Promise<LocationSummary | { error: string }> {
  await requireArtistAccess(artistId);
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
  await requireRecordAccess(db.location.findUnique({ where: { customerId }, select: { artistId: true } }));
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
  await requireRecordAccess(db.customer.findUnique({ where: { id: customerId }, select: { artistId: true } }));
  const loc = await db.location.findUnique({ where: { customerId } });
  // Its statements go with it (cascade) — their links switched off first.
  await retireStatementPaymentLinks({ customerId });
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
  await requireRecordAccess(db.location.findUnique({ where: { id: locationId }, select: { artistId: true } }));
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
  await requireRecordAccess(db.location.findUnique({ where: { id: locationId }, select: { artistId: true } }));
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

// Locations' Add works (2026-10-20, Craig's request): puts the chosen
// works at this Location — the same Location field the Artwork Catalogue
// and the Studio app's Consign set, which is what lists a work under
// "Works at …". Like them, it also fills "Can be viewed at" with the
// location's name where that's still empty. Only the artist's own works
// still for sale are moved; any others chosen are left as they are.
export async function moveArtworksToLocation(
  artistId: string,
  locationName: string,
  artworkIds: string[]
): Promise<{ moved: number; skipped: number } | { error: string }> {
  await requireArtistAccess(artistId);
  const location = await db.location.findUnique({
    where: { artistId_name: { artistId, name: locationName } },
    select: { name: true },
  });
  if (!location) return { error: "That location isn't on the list." };

  const ids = [...new Set(artworkIds)];
  const works = await db.artwork.findMany({
    where: { id: { in: ids }, artistId, availability: "AVAILABLE" },
    select: { id: true, viewingLocation: true },
  });
  const unseen = works.filter((w) => !w.viewingLocation).map((w) => w.id);
  await db.$transaction([
    db.artwork.updateMany({
      where: { id: { in: works.map((w) => w.id) } },
      data: { location: location.name },
    }),
    db.artwork.updateMany({ where: { id: { in: unseen } }, data: { viewingLocation: location.name } }),
  ]);
  return { moved: works.length, skipped: ids.length - works.length };
}
