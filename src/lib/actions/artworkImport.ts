"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import Papa from "papaparse";
import { uploadToR2 } from "@/lib/r2";
import { createArtworkWithRetry } from "./artworks";

// Generic CSV artwork import (2026-08-11) — built for Louise Dear's
// migration off her hard-coded prototype site, deliberately written to
// column names rather than assuming any one artist's export format, so
// the same import works for the next artist without changes. If a future
// export uses different column names, only the small set of lookups
// below (r["Title"], r["Price"], etc.) need adjusting — nothing else in
// this file is Louise-specific.
//
// Deliberately two separate steps rather than one bulk action:
// 1. parseArtworkImportCsv — pure parsing/cleaning, no DB or network
//    writes, safe to call repeatedly while the person reviews a preview.
// 2. importArtworkRow — does the real work for exactly ONE row (fetch the
//    image, upload it, create the records). The client calls this once
//    per row in a sequential loop, not as a single 100-row batch — a
//    single request fetching and uploading ~100 external images could
//    easily exceed a serverless function's execution time limit, and a
//    one-row-at-a-time loop also gives real, visible progress instead of
//    a single opaque "please wait".

export type NormalizedArtworkRow = {
  title: string;
  imageUrl: string;
  price: number | null;
  priceRaw: string;
  dimensions: string;
  medium: string;
  location: string;
  tier: string | null;
  group: string;
  type: string;
  description: string;
  sold: boolean;
  studioNotes: string;
};

function cleanPrice(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || /^enquire$/i.test(trimmed)) return null;
  const numeric = trimmed.replace(/[£$€,\s]/g, "");
  const n = parseFloat(numeric);
  return Number.isFinite(n) ? n : null;
}

// "Weycliffe Gallery" / "Wyecliffe Galleries" — same real place, two
// spellings, confirmed by the artist as a recurring data-entry drift in
// the old hand-coded site. Unified to "Wyecliffe Galleries" here so the
// import doesn't carry the inconsistency forward. Anything else in
// Location passes through untouched — including the literal value
// "Sold", confirmed as meaningful shorthand for "with the customer now",
// not an error to strip out.
function normalizeLocation(raw: string): string {
  const trimmed = raw.trim();
  if (/weycliffe/i.test(trimmed)) return "Wyecliffe Galleries";
  return trimmed;
}

export async function parseArtworkImportCsv(
  csvText: string
): Promise<{ rows: NormalizedArtworkRow[]; parseErrors: string[] }> {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const parseErrors = result.errors.map((e) => `Row ${e.row ?? "?"}: ${e.message}`);

  const rows: NormalizedArtworkRow[] = result.data
    .filter((r) => (r["Title"] || "").trim())
    .map((r) => ({
      title: (r["Title"] || "").trim(),
      imageUrl: (r["Image URL"] || "").trim(),
      price: cleanPrice(r["Price"] || ""),
      priceRaw: (r["Price"] || "").trim(),
      dimensions: (r["Dimensions"] || "").trim(),
      medium: (r["Medium"] || "").trim(),
      location: normalizeLocation(r["Location"] || ""),
      tier: (r["Tier"] || "").trim() || null,
      group: (r["Group"] || "").trim(),
      type: (r["Type"] || "").trim(),
      description: (r["Description"] || "").trim(),
      sold: (r["Sold"] || "").trim().toLowerCase() === "yes",
      studioNotes: (r["Notes"] || "").trim(),
    }));

  return { rows, parseErrors };
}

async function fetchAndUploadImage(
  artistId: string,
  imageUrl: string
): Promise<{ key: string; url: string; mimeType: string } | { error: string }> {
  let res: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    res = await fetch(imageUrl, { signal: controller.signal });
    clearTimeout(timeout);
  } catch (err) {
    return {
      error: `Could not fetch image (${err instanceof Error ? err.message : "network error"})`,
    };
  }
  if (!res.ok) return { error: `Image fetch failed — HTTP ${res.status}` };

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    return { error: `URL did not return an image (got "${contentType || "unknown"}")` };
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
  const key = `${artistId}/${randomUUID()}-import.${ext}`;
  await uploadToR2(key, buffer, contentType);
  return { key, url: `/api/media/${key}`, mimeType: contentType };
}

export async function importArtworkRow(
  artistId: string,
  siteId: string,
  row: NormalizedArtworkRow
): Promise<{ ok: true; catalogueNumber: string } | { ok: false; error: string }> {
  try {
    const imageResult = await fetchAndUploadImage(artistId, row.imageUrl);
    if ("error" in imageResult) return { ok: false, error: imageResult.error };

    const artwork = await createArtworkWithRetry(artistId, {
      presentationTitle: row.title,
      catalogueName: row.title,
      presentationPrice: row.price,
      dimensions: row.dimensions || null,
      description: row.description || null,
      medium: row.medium || null,
      presentationGroup: row.group || null,
      tier: row.tier,
      availability: row.sold ? "SOLD" : "AVAILABLE",
      type: row.type || null,
      catalogueGroup: row.group || null,
      size: row.dimensions || null,
      location: row.location || null,
      priceUnframed: row.price,
      studioNotes: row.studioNotes || null,
    });

    const image = await db.image.create({
      data: {
        artistId,
        key: imageResult.key,
        url: imageResult.url,
        kind: "PHOTO",
        mimeType: imageResult.mimeType,
        status: "SORTED",
        source: "CSV import",
        artworkId: artwork.id,
      },
    });

    await db.artwork.update({ where: { id: artwork.id }, data: { mainImageId: image.id } });

    return { ok: true, catalogueNumber: artwork.catalogueNumber };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Import failed for this row.",
    };
  } finally {
    // Revalidated after every row rather than once at the very end — the
    // import can take several minutes for ~100 rows, and this way the
    // Artwork Catalogue reflects progress if it's checked mid-import.
    revalidatePath(`/sites/${siteId}/artworks`);
  }
}
