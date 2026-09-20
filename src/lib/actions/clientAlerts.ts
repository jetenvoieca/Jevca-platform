"use server";

import { db } from "@/lib/db";
import { revalidatePath, updateTag } from "next/cache";
import { OPEN_ALERTS_TAG, isArtistSubscriptionOverdue } from "@/lib/alerts";

// What appears in the Inbox's Done list when a client is marked up to
// date — stored as a completed Task (name = the client, category = this
// text) so the Done list needs no second data source. See getCompletedTasks.
const UP_TO_DATE_LABEL = "Subscription payments updated";

// "Up to date" on a payment-overdue alert (2026-09-19, CRM Phase 3).
// The overdue alert is computed from the payment records rather than
// stored, so it can only genuinely clear once a recent payment exists —
// this refuses (rather than logging a Done entry for an alert that would
// just come straight back) until that's true.
export async function markSubscriptionUpToDate(
  artistId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const artist = await db.artist.findUnique({ where: { id: artistId }, select: { name: true } });
  if (!artist) return { ok: false, error: "Client not found." };

  if (await isArtistSubscriptionOverdue(artistId)) {
    return {
      ok: false,
      error: "Add the payment first — this alert only clears once a recent subscription payment is recorded.",
    };
  }

  await db.task.create({
    data: { artistId, name: artist.name, category: UP_TO_DATE_LABEL, completedAt: new Date() },
  });
  updateTag(OPEN_ALERTS_TAG);
  revalidatePath("/accounts/inbox");
  return { ok: true };
}

// Expires the cached open-alerts scan (see OPEN_ALERTS_TAG) — called
// after something changed a sale from the Inbox's sale modal (marked
// paid, cancelled, deleted, invoice sent), which the sale actions
// themselves don't do, so the Alert list and nav badge catch up straight
// away.
export async function refreshOpenAlerts(): Promise<void> {
  updateTag(OPEN_ALERTS_TAG);
}
