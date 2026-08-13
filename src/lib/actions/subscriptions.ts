"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

// ---- Payment method (Stripe / PayPal / DD) — either/or, decided once ----
// Reuses Artist.paymentMethod (already existed). Kept here rather than in
// the general updateArtist action because switching it changes which UI
// (linked Stripe Customer vs manual entry grid) the Subscription panel
// shows — a deliberate choice, not an incidental field save.
export async function updateArtistPaymentMethod(
  artistId: string,
  siteId: string,
  paymentMethod: "" | "Stripe" | "PayPal" | "DD"
) {
  await db.artist.update({
    where: { id: artistId },
    data: { paymentMethod: paymentMethod || null },
  });
  revalidatePath(`/sites/${siteId}`);
}

// ---- Link this artist to their Stripe Customer in the PLATFORM Stripe
// account (separate from any per-artist buyer-facing Stripe activity) ----
// Pasted in once by hand (2026-08-13 decision — no auto-matching by
// email, since emails can differ or be blank).
export async function updateStripeSubscriptionCustomerId(
  artistId: string,
  siteId: string,
  stripeSubscriptionCustomerId: string
) {
  await db.artist.update({
    where: { id: artistId },
    data: {
      stripeSubscriptionCustomerId: stripeSubscriptionCustomerId.trim() || null,
    },
  });
  revalidatePath(`/sites/${siteId}`);
}

// ---- Manual subscription payment rows (PayPal / DD) ----
// Deliberately a real action with confirmation-free add/delete (low
// stakes, easily corrected — not the same category as the Danger Zone
// resets elsewhere in this app) rather than autosave-on-blur, since a
// payment row is a discrete fact ("they paid £9.95 on this date"), not a
// field that's gradually being typed.

export async function addManualSubscriptionPayment(
  artistId: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const amountRaw = (formData.get("amount") as string)?.trim();
  const paidAtRaw = (formData.get("paidAt") as string)?.trim();
  const currency = (formData.get("currency") as string)?.trim() || "GBP";

  const amount = parseFloat(amountRaw);
  if (!amountRaw || Number.isNaN(amount)) {
    return { ok: false, error: "Enter a valid amount." };
  }
  if (!paidAtRaw) {
    return { ok: false, error: "Enter a date." };
  }

  await db.subscriptionPayment.create({
    data: {
      artistId,
      source: "MANUAL",
      amount,
      currency,
      paidAt: new Date(paidAtRaw),
    },
  });
  revalidatePath(`/sites/${siteId}`);
  return { ok: true };
}

export async function deleteManualSubscriptionPayment(id: string, siteId: string) {
  // Guard against ever deleting a Stripe-synced row from this UI — that
  // history should only ever change via the webhook that created it.
  const row = await db.subscriptionPayment.findUnique({ where: { id } });
  if (!row || row.source !== "MANUAL") return;
  await db.subscriptionPayment.delete({ where: { id } });
  revalidatePath(`/sites/${siteId}`);
}
