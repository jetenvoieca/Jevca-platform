"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import Papa from "papaparse";
import { uploadToR2, deleteFromR2 } from "@/lib/r2";
import { generateImageSizes } from "@/lib/imageSizes";
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

// Confirmed 2026-08-11, from the actual data — not a bot-blocking or
// network issue as first (wrongly) assumed: 58 of this export's 100
// Image URL values are two complete URLs concatenated with no
// separator, e.g. "https://louisedear.comhttps://pub-xxxx.r2.dev/...".
// A bug in the old site's own export, not anything server-side here.
// Every single one of the 58 follows this exact shape (verified — no
// partial/different variants), so this is a safe, complete repair
// rather than a guess at a fix.
//
// Exported (2026-08-17) so the Hopper's own CSV import
// (hopperImport.ts) can reuse it too, on the off chance the same messy
// export is ever reused there.
export function repairDoubledUrl(raw: string): string {
  const match = raw.match(/^https?:\/\/[^/]+(https?:\/\/.+)$/);
  return match ? match[1] : raw;
}

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
      imageUrl: repairDoubledUrl((r["Image URL"] || "").trim()),
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

// Exported (2026-08-17) so the Hopper's own CSV import (hopperImport.ts)
// can reuse this instead of duplicating the retry/User-Agent-spoofing
// logic, which is genuinely non-trivial and shouldn't drift between two
// copies.
export async function fetchAndUploadImage(
  artistId: string,
  imageUrl: string
): Promise<
  | { key: string; url: string; mimeType: string; thumbnailKey: string | null; displayKey: string | null }
  | { error: string }
> {
  // Confirmed cause of the 2026-08-11 run's ~60% failure rate: a bare
  // server-to-server fetch with no User-Agent/Referer looks like a bot to
  // most hosting setups (WordPress security plugins, generic hotlink
  // protection, Cloudflare's own bot heuristics all commonly do this) —
  // and gets blocked or rate-limited, inconsistently, which is exactly
  // the "works for some, fails for others" pattern seen. A realistic
  // browser-shaped request, plus a couple of retries for anything still
  // transient, fixes the large majority of these.
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    Referer: new URL(imageUrl).origin + "/",
  };

  let lastError = "Unknown error";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(imageUrl, { signal: controller.signal, headers });
      clearTimeout(timeout);

      if (!res.ok) {
        lastError = `Image fetch failed — HTTP ${res.status}`;
        // A 4xx (other than 429) won't fix itself on retry — no point
        // burning two more attempts on a URL that's genuinely wrong.
        if (res.status !== 429 && res.status < 500) break;
      } else {
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) {
          lastError = `URL did not return an image (got "${contentType || "unknown"}")`;
          break;
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
        const key = `${artistId}/${randomUUID()}-import.${ext}`;
        await uploadToR2(key, buffer, contentType);

        // Same as the direct-upload path (see finalizeUpload in media.ts)
        // — generated once here, at import time, rather than costing
        // every future page view. Already have the buffer in hand, so
        // no extra R2 round trip is needed to fetch it back, unlike the
        // direct-upload path. Non-fatal on failure, same reasoning as
        // there: the row still gets created, just without the sped-up
        // sizes until a retry or backfill.
        let thumbnailKey: string | null = null;
        let displayKey: string | null = null;
        try {
          const sizes = await generateImageSizes(buffer);
          thumbnailKey = `${key}-thumb.jpg`;
          displayKey = `${key}-display.jpg`;
          await Promise.all([
            uploadToR2(thumbnailKey, sizes.thumbnail, sizes.contentType),
            uploadToR2(displayKey, sizes.display, sizes.contentType),
          ]);
        } catch (err) {
          console.error(`[fetchAndUploadImage] Could not generate sizes for ${key}:`, err);
        }

        return { key, url: `/api/media/${key}`, mimeType: contentType, thumbnailKey, displayKey };
      }
    } catch (err) {
      lastError = `Could not fetch image (${err instanceof Error ? err.message : "network error"})`;
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return { error: lastError };
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
      description: row.description || null,
      medium: row.medium || null,
      presentationGroup: row.group || null,
      tier: row.tier,
      availability: row.sold ? "SOLD" : "AVAILABLE",
      type: row.type || null,
      catalogueGroup: row.group || null,
      // Size and Dimensions are the same field (2026-08-16) — Size
      // already holds real dimension-like values via the artist's own
      // preset list, so the CSV's "Dimensions" column maps to Size,
      // not a separate now-unused field.
      size: row.dimensions || null,
      location: row.location || null,
      studioNotes: row.studioNotes || null,
      // A CSV-imported row is exactly as "raw" as a Hopper quick-create
      // — real data, but never actually opened and reviewed by a person
      // yet (2026-08-17, direct request — this was the one other place
      // artworks get created besides the Hopper and the ordinary
      // "+ New", and it had been missed the first time round). Cleared
      // the same way as the Hopper's own flag, the first time this
      // artwork is actually opened and saved.
      needsReview: true,
    });

    const image = await db.image.create({
      data: {
        artistId,
        key: imageResult.key,
        url: imageResult.url,
        thumbnailKey: imageResult.thumbnailKey,
        displayKey: imageResult.displayKey,
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

// ---------- Bulk cleanup: every artwork this import feature created ----------
//
// Added 2026-08-11 after several repeated/restarted import attempts (the
// broken-URL rows caused genuine retries) left duplicate copies of
// whatever had already succeeded, since imports don't check for existing
// matches — see importArtworkRow above. Rather than try to detect which
// copies are "real" duplicates vs legitimate variants (this export has
// genuine duplicate titles — confirmed by the artist, "same base image
// produced in different ways" — so that's a real risk of getting wrong),
// this instead offers a clean slate: delete every artwork this import
// feature has ever created for the artist, then re-run the import fresh
// now that the underlying bug is fixed. Strictly scoped to
// source: "CSV import" — can never touch anything added any other way.

export async function getCsvImportedArtworkIds(artistId: string): Promise<string[]> {
  const artworks = await db.artwork.findMany({
    where: { artistId, mainImage: { source: "CSV import" } },
    select: { id: true },
  });
  return artworks.map((a) => a.id);
}

export async function deleteArtworksByIds(
  siteId: string,
  artworkIds: string[]
): Promise<{ deleted: number; failed: { id: string; error: string }[] }> {
  let deleted = 0;
  const failed: { id: string; error: string }[] = [];

  for (const id of artworkIds) {
    try {
      const artwork = await db.artwork.findUnique({
        where: { id },
        select: { images: { select: { id: true, key: true } } },
      });
      if (!artwork) continue;

      // mainImageId is a unique FK pointing at an Image — cleared first
      // so that Image can actually be deleted below without conflict.
      await db.artwork.update({ where: { id }, data: { mainImageId: null } });

      for (const img of artwork.images) {
        try {
          await deleteFromR2(img.key);
        } catch {
          // An already-gone R2 object shouldn't block the database
          // cleanup — the end state (nothing left behind) is the same.
        }
        await db.image.delete({ where: { id: img.id } });
      }

      await db.artwork.delete({ where: { id } });
      deleted++;
    } catch (err) {
      // Most likely cause: this artwork already has a real Purchase or
      // Sale Terms attached (blocks deletion at the database level) — if
      // so, it's not safe to silently remove, and this surfaces that
      // rather than failing the whole batch.
      failed.push({
        id,
        error: err instanceof Error ? err.message : "Could not delete this artwork.",
      });
    }
  }

  revalidatePath(`/sites/${siteId}/artworks`);
  return { deleted, failed };
}
