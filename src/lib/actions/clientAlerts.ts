"use server";

import { db } from "@/lib/db";
import { revalidatePath, updateTag } from "next/cache";
import { OPEN_ALERTS_TAG, isArtistSubscriptionOverdue } from "@/lib/alerts";

// Server actions for the Inbox's Alert view.

// The type an "Up to date" record is filed under — the overdue-payment
// alert it deals with.
const OVERDUE_ALERT_TYPE = "SUBSCRIPTION_PAYMENT_OVERDUE";

// "Up to date" on a payment-overdue alert (2026-09-19, CRM Phase 3).
// The overdue alert is computed from the payment records rather than
// stored, so it can only genuinely clear once a recent payment exists —
// this refuses (rather than logging an entry for an alert that would
// just come straight back) until that's true. Once it is, it's recorded
// as a processed alert (2026-09-28 — until then it was logged as a
// completed Task, in the task Done list), so it shows in the Alert view's
// processed list; see getProcessedAlerts.
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

  await db.alertEvent.create({
    data: {
      artistId,
      type: OVERDUE_ALERT_TYPE,
      severity: "WARNING",
      message: `${artist.name}: subscription payments updated.`,
      resolvedAt: new Date(),
    },
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

export type ProcessedAlertItem = {
  id: string;
  type: string;
  message: string;
  artistId: string | null;
  artistName: string | null;
  resolvedAt: string; // ISO
};

// The Alert view's processed list (2026-09-28, direct request — it used
// to show the task Done list, which was confusing): every stored alert
// that's been dealt with — dismissed, cleared by opening it (an email
// reply), or a client marked Up to date — most recently dealt with
// first, optionally for one artist. Fetched on demand, like the Sent and
// Done lists. Alerts worked out live (an overdue invoice, say) aren't
// stored, so they simply stop appearing once dealt with and have nothing
// to list here.
export async function getProcessedAlerts(artistId?: string): Promise<ProcessedAlertItem[]> {
  const rows = await db.alertEvent.findMany({
    where: { resolvedAt: { not: null }, ...(artistId ? { artistId } : {}) },
    orderBy: { resolvedAt: "desc" },
    take: 200,
    include: { artist: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    message: r.message,
    artistId: r.artistId,
    artistName: r.artist?.name || null,
    resolvedAt: (r.resolvedAt ?? r.createdAt).toISOString(),
  }));
}

// Deletes a processed alert's record for good. Only ever an alert that's
// already been dealt with — an open one can't be removed this way.
export async function deleteProcessedAlert(id: string): Promise<void> {
  await db.alertEvent.deleteMany({ where: { id, resolvedAt: { not: null } } });
}
