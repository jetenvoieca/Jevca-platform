"use server";

import { db } from "@/lib/db";
import { requireAdmin, requireSiteAccess } from "@/lib/currentUser";
import { readSiteFeatures } from "@/lib/siteFeaturesData";
import { noteHopperAdded } from "@/lib/hopperAlerts";
import { listArtistAppPages, type ArtistAppPage } from "@/lib/actions/artistApp";
import { arrangePages } from "@/lib/artistAppPageOrder";
import { listPageStyles } from "@/lib/actions/pageStyles";
import { readContactPanel } from "@/lib/contactPanel";
import { readLocations } from "@/lib/artworkSettingsData";
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
  input: { kind: string; text: string; imageId: string | null; pageId: string | null },
): Promise<{ ok: true } | { error: string }> {
  const artistId = await conciergeArtist(siteId);
  if (typeof artistId !== "string") return artistId;
  if (!CONCIERGE_KINDS.some((k) => k.key === input.kind)) return { error: "Choose what you'd like done." };
  const text = input.text.trim();
  if (!text) return { error: "Say what's needed first." };
  if (text.length > CONCIERGE_MAX_LENGTH) return { error: `Keep it under ${CONCIERGE_MAX_LENGTH} characters.` };
  if (input.imageId && input.kind !== "artwork") return { error: "Only an artwork request takes a picture." };
  if (input.imageId) {
    const image = await db.image.findFirst({ where: { id: input.imageId, artistId }, select: { id: true } });
    if (!image) return { error: "That picture wasn't found." };
  }
  if (input.pageId && input.kind !== "rearrange") return { error: "Only a rearrange request names a page." };
  if (input.pageId) {
    const page = await db.page.findFirst({ where: { id: input.pageId, siteId }, select: { id: true } });
    if (!page) return { error: "That page wasn't found." };
  }
  await db.hopperNote.create({
    data: { artistId, siteId, kind: input.kind, text, imageId: input.imageId, pageId: input.pageId },
  });
  await noteHopperAdded(artistId);
  return { ok: true };
}

// "Rearrange artworks on a page" — "On which page?" (2026-11-13, Craig's
// mockup): the site's pages that show works, in the lists' order (Live,
// then Hidden), leaving out a group's title page (its pages are listed).
export async function listConciergeWorkPages(siteId: string): Promise<{ id: string; title: string }[]> {
  const artistId = await conciergeArtist(siteId);
  if (typeof artistId !== "string") return [];
  const [pages, rows, styles] = await Promise.all([
    listArtistAppPages(siteId),
    db.page.findMany({ where: { siteId }, select: { id: true, pageStyleId: true, contactPanel: true } }),
    listPageStyles(),
  ]);
  const showcaseStyles = new Set(
    styles
      .filter((st) => st.type === "BLOCK_BUILD" && st.layout.blocks.some((b) => b.type === "showcase"))
      .map((st) => st.id),
  );
  const byId = new Map<string, { pageStyleId: string | null; contactPanel: unknown }>(
    rows.map((r) => [r.id, r]),
  );
  return arrangePages<ArtistAppPage>(pages)
    .filter((p) => {
      const row = byId.get(p.id);
      if (!row || readContactPanel(row.contactPanel) || pages.some((c) => c.parentId === p.id)) return false;
      return p.hasCuration || (!!row.pageStyleId && showcaseStyles.has(row.pageStyleId));
    })
    .map((p) => ({ id: p.id, title: p.title }));
}

// The artist's requests, newest first, with whether each is done.
export async function listConciergeRequests(siteId: string): Promise<ConciergeRequest[]> {
  const artistId = await conciergeArtist(siteId);
  if (typeof artistId !== "string") return [];
  const rows = await db.hopperNote.findMany({
    where: { artistId, kind: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      kind: true,
      text: true,
      doneAt: true,
      createdAt: true,
      image: { select: { url: true } },
      page: { select: { title: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: [conciergeKindLabel(r.kind) ?? "Request", r.page?.title].filter(Boolean).join(" · "),
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
  artistId: string;
  client: string;
  siteId: string | null;
  siteName: string | null;
  // The page the request is about, if the artist chose one.
  pageId: string | null;
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
      artistId: true,
      artist: { select: { name: true } },
      site: { select: { id: true, name: true } },
      pageId: true,
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
    artistId: n.artistId,
    client: n.artist.name,
    siteId: n.site?.id ?? null,
    siteName: n.site?.name ?? null,
    pageId: n.pageId,
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

// A site's pages task (Reorder pages, Rearrange artworks): its client, its
// pages, arranged, and its plan's pages per group.
export async function conciergeSitePages(
  siteId: string,
): Promise<{ artistId: string; pages: ArtistAppPage[]; pagesPerGroup: number | null }> {
  await requireAdmin();
  const [site, pages, features] = await Promise.all([
    db.site.findUniqueOrThrow({ where: { id: siteId }, select: { artistId: true } }),
    listArtistAppPages(siteId),
    readSiteFeatures(siteId),
  ]);
  return { artistId: site.artistId, pages: arrangePages(pages), pagesPerGroup: features.pagesPerGroup };
}

// "Update my list of Galleries": the client's Locations of type Gallery, to
// choose from.
export async function conciergeGalleryOptions(artistId: string): Promise<{ id: string; name: string }[]> {
  await requireAdmin();
  const locations = await readLocations(artistId);
  return locations.filter((l) => l.type === "GALLERY").map((l) => ({ id: l.id, name: l.name }));
}
