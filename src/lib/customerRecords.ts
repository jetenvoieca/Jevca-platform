import { db } from "@/lib/db";

// Finding or creating a sale's buyer (moved here from
// lib/actions/customers.ts, 2026-10-26): plain server code, used by the
// checked action findOrCreateCustomer and by sales recorded from the
// Studio app and the website, which check who's asking themselves.

// Used when starting a sale — reuses an existing customer if the typed
// email already matches one for this artist (avoiding accidental
// duplicates for the same real person), otherwise creates a new one.
// Name-only entries (no email) always create new, since name alone
// isn't a safe enough match.
//
// 2026-08-16 fix: an explicit `customerId` (set when the person actually
// picks a result from CustomerPicker, rather than just typing a name)
// is now authoritative and skips the name/email matching entirely. Before
// this, picking an existing customer only copied their name/email/address
// into the form's free-text fields — if that customer had no email on
// file (common for a past/offline sale that predates this feature, or
// any gallery-only contact), the email-match below would find nothing
// and silently create a second, blank-ish duplicate of someone already
// selected by name. Verified against `artistId` so a stale or foreign id
// can never attach a sale to the wrong artist's customer.
export async function findOrCreateCustomerRecord(
  artistId: string,
  data: { name: string; email?: string | null; address?: string | null; customerId?: string | null }
): Promise<{ id: string }> {
  if (data.customerId) {
    const picked = await db.customer.findFirst({
      where: { id: data.customerId, artistId },
      select: { id: true },
    });
    if (picked) return { id: picked.id };
    // Falls through to the usual matching/create path if the id somehow
    // doesn't resolve (e.g. deleted between selecting and submitting) —
    // better to create a sane record than to fail the whole sale.
  }

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
