"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import { repairDoubledUrl } from "@/lib/importHelpers";
import {
  hopperVideoImportStates,
  startHopperVideoImport,
  type HopperVideoImportState,
} from "@/lib/hopperVideoImport";
import { fetchAndUploadImage } from "./artworkImport";

// Import a CSV straight into the Hopper's sorting queue, rather than
// creating finished artworks the way the Artwork Catalogue's own CSV
// import does — part of a deliberate move (2026-08-17, direct request)
// towards the Hopper being the single controlled intake point for every
// image regardless of source, so everything still goes through the same
// one-at-a-time sort/review step no matter how it arrived. The Artwork
// Catalogue's CSV import is untouched — this is a separate, additional
// path, not a replacement.
//
// Deliberately minimal columns compared to the Artwork import: just a
// URL (required) and an optional Title/Name, used only as the Hopper
// item's starting Caption — every other detail (Type, Price, Medium,
// etc.) is filled in later, by hand, while actually sorting each item,
// same as any other Hopper item regardless of where it came from.
//
// The URL can be a photo or a video (2026-10-15). A photo is copied
// straight away; a video is handed to a background copy (see
// lib/hopperVideoImport.ts), and the import window waits for it.

export type NormalizedHopperImportRow = {
  url: string;
  title: string;
};

export async function parseHopperImportCsv(
  csvText: string
): Promise<{ rows: NormalizedHopperImportRow[]; parseErrors: string[] }> {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const parseErrors = result.errors.map((e) => `Row ${e.row ?? "?"}: ${e.message}`);

  // Accepts "Image URL", "Video URL" or "URL" for the required column,
  // and either "Title" or "Name" for the optional one — the same loose
  // matching spirit as the Artwork import, without assuming any one
  // export format.
  const rows: NormalizedHopperImportRow[] = result.data
    .map((r) => ({
      url: repairDoubledUrl((r["Image URL"] || r["Video URL"] || r["URL"] || "").trim()),
      title: (r["Title"] || r["Name"] || "").trim(),
    }))
    .filter((r) => r.url);

  return { rows, parseErrors };
}

export async function importHopperCsvRow(
  artistId: string,
  siteId: string,
  row: NormalizedHopperImportRow
): Promise<{ ok: true; videoImportId?: string } | { ok: false; error: string }> {
  const fetched = await fetchAndUploadImage(artistId, row.url);
  if ("error" in fetched) return { ok: false, error: fetched.error };

  if ("video" in fetched) {
    const started = await startHopperVideoImport(artistId, row.url, row.title, fetched.video);
    if ("error" in started) return { ok: false, error: started.error };
    return { ok: true, videoImportId: started.importId };
  }

  await db.image.create({
    data: {
      artistId,
      key: fetched.key,
      url: fetched.url,
      thumbnailKey: fetched.thumbnailKey,
      displayKey: fetched.displayKey,
      kind: "PHOTO",
      mimeType: fetched.mimeType,
      status: "HOPPER",
      source: "CSV import",
      caption: row.title || null,
    },
  });

  revalidatePath(`/sites/${siteId}/hopper`);
  return { ok: true };
}

// Where this import's video copies have got to.
export async function getHopperVideoImports(
  artistId: string,
  ids: string[]
): Promise<HopperVideoImportState[]> {
  if (ids.length === 0) return [];
  return hopperVideoImportStates(artistId, ids);
}
