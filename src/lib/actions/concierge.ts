"use server";

import { db } from "@/lib/db";
import { requireAdmin, requireSiteAccess } from "@/lib/currentUser";
import { readSiteFeatures } from "@/lib/siteFeaturesData";
import { noteHopperAdded } from "@/lib/hopperAlerts";
import { listArtistAppPages, type ArtistAppPage } from "@/lib/actions/artistApp";
import { arrangePages } from "@/lib/artistAppPageOrder";
import type { HopperNoteItem } from "@/lib/actions/hopper";
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
  await db.hopperNote.create({ data: { artistId, siteId, kind: input.kind, text, imageId: input.imageId } });
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

// ---------- Administration → Concierge (2026-11-13, Craig's mockup) ----------
// Every client's notes still to do — Concierge requests and the Studio
// app's instructions — and the pictures sent with Concierge requests still
// in their Hopper, from every site, newest first. Done or Delete as in a
// site's Hopper (completeHopperNote / deleteHopperNote); Done shows on the
// artist's "Your requests".

export type ConciergeNote = HopperNoteItem & {
  // The kind's key (CONCIERGE_KINDS), which picks the form to act on it.
  kindKey: string | null;
  client: string;
  siteId: string | null;
  siteName: string | null;
};

export type ConciergePicture = {
  imageId: string;
  url: string;
  createdAt: string;
  client: string;
  // Sorted in this site's Hopper.
  siteId: string;
};

export async function listConciergeQueue(): Promise<{ notes: ConciergeNote[]; pictures: ConciergePicture[] }> {
  await requireAdmin();
  const rows = await db.hopperNote.findMany({
    where: { doneAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      text: true,
      kind: true,
      createdAt: true,
      artist: { select: { name: true } },
      site: { select: { id: true, name: true } },
      image: { select: { id: true, url: true, status: true, createdAt: true } },
    },
  });
  const notes = rows.map((n) => ({
    id: n.id,
    text: n.text,
    createdAt: n.createdAt.toISOString(),
    kind: conciergeKindLabel(n.kind),
    imageUrl: n.image?.url ?? null,
    kindKey: n.kind,
    client: n.artist.name,
    siteId: n.site?.id ?? null,
    siteName: n.site?.name ?? null,
  }));
  const pictures = rows.flatMap((n) =>
    n.image && n.image.status === "HOPPER" && n.site
      ? [
          {
            imageId: n.image.id,
            url: n.image.url,
            createdAt: n.image.createdAt.toISOString(),
            client: n.artist.name,
            siteId: n.site.id,
          },
        ]
      : [],
  );
  return { notes, pictures };
}

// Reorder pages: the site's pages, arranged, and its plan's pages per group.
export async function conciergeSitePages(
  siteId: string,
): Promise<{ pages: ArtistAppPage[]; pagesPerGroup: number | null }> {
  await requireAdmin();
  const [pages, features] = await Promise.all([listArtistAppPages(siteId), readSiteFeatures(siteId)]);
  return { pages: arrangePages(pages), pagesPerGroup: features.pagesPerGroup };
}
