import { db } from "@/lib/db";
import { parisToDate, parisToday } from "@/lib/parisTime";

// Hopper alerts (2026-10-31, Craig's mockup), on the Dashboard's Alert tab:
//
// - HOPPER_ITEMS_ADDED (open, in the Alerts list): "5 items added to
//   Hopper" — one per arrival. Items that arrive within ARRIVAL_GAP_MS of
//   the one before count as the same arrival, so a batch of photos makes
//   one alert however they come in (the Studio app and iPhone Shortcut send
//   one at a time). Removed once the client's Hopper is empty — the
//   processed entries below are the record of what was done with them.
//
// - HOPPER_ITEMS_PROCESSED (in the Processed list from the start): "3
//   Hopper items processed" — one per client per day (Paris), counting
//   items moved to Media, the Bucket, made an artwork, or deleted, and
//   notes marked done or deleted.
//
// An item is a picture or video (an Image in the Hopper) or a note sent
// from the Studio app (HopperNote).
//
// Both count every item, whoever added or processed it. Neither ever
// stops what raised it: a failure here is logged, not passed on.
export const HOPPER_ADDED_ALERT_TYPE = "HOPPER_ITEMS_ADDED";
export const HOPPER_PROCESSED_ALERT_TYPE = "HOPPER_ITEMS_PROCESSED";

const ARRIVAL_GAP_MS = 30 * 60 * 1000;

function itemsWord(count: number): string {
  return count === 1 ? "1 item" : `${count} items`;
}

function addedMessage(count: number): string {
  return `${itemsWord(count)} added to Hopper`;
}

function processedMessage(count: number): string {
  return `${count === 1 ? "1 Hopper item" : `${count} Hopper items`} processed`;
}

// Items just put in a client's Hopper.
export async function noteHopperAdded(artistId: string, count = 1): Promise<void> {
  if (count <= 0) return;
  try {
    const now = new Date();
    const open = await db.alertEvent.findFirst({
      where: {
        artistId,
        type: HOPPER_ADDED_ALERT_TYPE,
        resolvedAt: null,
        lastItemAt: { gte: new Date(now.getTime() - ARRIVAL_GAP_MS) },
      },
      orderBy: { lastItemAt: "desc" },
      select: { id: true },
    });
    if (open) {
      const row = await db.alertEvent.update({
        where: { id: open.id },
        data: { itemCount: { increment: count }, lastItemAt: now },
        select: { itemCount: true },
      });
      await db.alertEvent.update({
        where: { id: open.id },
        data: { message: addedMessage(row.itemCount ?? count) },
      });
      return;
    }
    await db.alertEvent.create({
      data: {
        artistId,
        type: HOPPER_ADDED_ALERT_TYPE,
        severity: "WARNING",
        message: addedMessage(count),
        itemCount: count,
        lastItemAt: now,
      },
    });
  } catch (err) {
    console.error("noteHopperAdded failed", artistId, err);
  }
}

// Items just taken out of a client's Hopper.
export async function noteHopperProcessed(artistId: string, count = 1): Promise<void> {
  if (count <= 0) return;
  try {
    const now = new Date();
    const dayStart = parisToDate(parisToday(), "00:00") ?? now;
    const today = await db.alertEvent.findFirst({
      where: { artistId, type: HOPPER_PROCESSED_ALERT_TYPE, resolvedAt: { gte: dayStart } },
      orderBy: { resolvedAt: "desc" },
      select: { id: true },
    });
    if (today) {
      const row = await db.alertEvent.update({
        where: { id: today.id },
        data: { itemCount: { increment: count }, lastItemAt: now, resolvedAt: now },
        select: { itemCount: true },
      });
      await db.alertEvent.update({
        where: { id: today.id },
        data: { message: processedMessage(row.itemCount ?? count) },
      });
    } else {
      await db.alertEvent.create({
        data: {
          artistId,
          type: HOPPER_PROCESSED_ALERT_TYPE,
          severity: "WARNING",
          message: processedMessage(count),
          itemCount: count,
          lastItemAt: now,
          resolvedAt: now,
        },
      });
    }

    const [pictures, notes] = await Promise.all([
      db.image.count({ where: { artistId, status: "HOPPER" } }),
      db.hopperNote.count({ where: { artistId, doneAt: null } }),
    ]);
    if (pictures + notes === 0) {
      await db.alertEvent.deleteMany({
        where: { artistId, type: HOPPER_ADDED_ALERT_TYPE, resolvedAt: null },
      });
    }
  } catch (err) {
    console.error("noteHopperProcessed failed", artistId, err);
  }
}

// The instructions (HopperNote text) that came in with each "added" alert
// — those sent between the arrival's first and latest item, oldest first
// — for the alert to show (2026-10-31). A note is saved just before its
// alert is raised, hence the minute's slack at the start. By alert id;
// alerts with none are left out.
const NOTE_SLACK_MS = 60 * 1000;

export async function hopperArrivalNotes(
  alerts: { id: string; artistId: string | null; createdAt: Date; lastItemAt: Date | null }[]
): Promise<Map<string, string[]>> {
  const byAlert = new Map<string, string[]>();
  const artistIds = [...new Set(alerts.flatMap((a) => (a.artistId ? [a.artistId] : [])))];
  if (artistIds.length === 0) return byAlert;
  const earliest = Math.min(...alerts.map((a) => a.createdAt.getTime())) - NOTE_SLACK_MS;
  const notes = await db.hopperNote.findMany({
    where: { artistId: { in: artistIds }, createdAt: { gte: new Date(earliest) } },
    orderBy: { createdAt: "asc" },
    select: { artistId: true, text: true, createdAt: true },
  });
  for (const a of alerts) {
    const from = a.createdAt.getTime() - NOTE_SLACK_MS;
    const to = (a.lastItemAt ?? a.createdAt).getTime();
    const texts = notes
      .filter((n) => n.artistId === a.artistId && n.createdAt.getTime() >= from && n.createdAt.getTime() <= to)
      .map((n) => n.text);
    if (texts.length > 0) byAlert.set(a.id, texts);
  }
  return byAlert;
}
