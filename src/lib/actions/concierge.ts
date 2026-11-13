"use server";

import { db } from "@/lib/db";
import { requireSiteAccess } from "@/lib/currentUser";
import { readSiteFeatures } from "@/lib/siteFeaturesData";
import { noteHopperAdded } from "@/lib/hopperAlerts";
import {
  CONCIERGE_KINDS,
  CONCIERGE_MAX_LENGTH,
  conciergeKindLabel,
  type ConciergeRequest,
} from "@/lib/concierge";

// The Artist App's Concierge (2026-11-13): requests go to the client's
// Hopper as notes (HopperNote, with its kind and one picture — the picture
// itself uploaded to the Hopper to sort). With Personal Concierge only.

async function conciergeArtist(siteId: string): Promise<string | { error: string }> {
  const { artistId } = await requireSiteAccess(siteId);
  if (!(await readSiteFeatures(siteId)).concierge) return { error: "Personal Concierge isn't on this plan." };
  return artistId;
}

export async function sendConciergeRequest(
  siteId: string,
  input: { kind: string; text: string; imageId: string | null },
): Promise<{ ok: true } | { error: string }> {
  const artistId = await conciergeArtist(siteId);
  if (typeof artistId !== "string") return artistId;
  if (!CONCIERGE_KINDS.some((k) => k.key === input.kind)) return { error: "Choose what you'd like done." };
  const text = input.text.trim();
  if (!text) return { error: "Say what's needed first." };
  if (text.length > CONCIERGE_MAX_LENGTH) return { error: `Keep it under ${CONCIERGE_MAX_LENGTH} characters.` };
  if (input.imageId) {
    const image = await db.image.findFirst({ where: { id: input.imageId, artistId }, select: { id: true } });
    if (!image) return { error: "That picture wasn't found." };
  }
  await db.hopperNote.create({ data: { artistId, kind: input.kind, text, imageId: input.imageId } });
  await noteHopperAdded(artistId);
  return { ok: true };
}

// The artist's requests, newest first, with whether each is done.
export async function listConciergeRequests(siteId: string): Promise<ConciergeRequest[]> {
  const artistId = await conciergeArtist(siteId);
  if (typeof artistId !== "string") return [];
  const rows = await db.hopperNote.findMany({
    where: { artistId, kind: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, kind: true, text: true, doneAt: true, createdAt: true, image: { select: { url: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: conciergeKindLabel(r.kind) ?? "Request",
    text: r.text,
    imageUrl: r.image?.url ?? null,
    createdAt: r.createdAt.toISOString(),
    done: r.doneAt !== null,
  }));
}
