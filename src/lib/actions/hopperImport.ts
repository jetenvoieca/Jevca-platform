"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import { repairDoubledUrl, fetchAndUploadImage } from "./artworkImport";

// Import a CSV straight into the Hopper's sorting queue, rather than
// creating finished artworks the way the Artwork Catalogue's own CSV
// import does — part of a deliberate move (2026-08-17, direct request)
// towards the Hopper being the single controlled intake point for every
// image regardless of source, so everything still goes through the same
// one-at-a-time sort/review step no matter how it arrived. The Artwork
// Catalogue's CSV import is untouched — this is a separate, additional
// path, not a replacement.
//
// Deliberately minimal columns compared to the Artwork import: just an
// Image URL (required) and an optional Title/Name, used only as the
// Hopper item's starting Caption — every other detail (Type, Price,
// Medium, etc.) is filled in later, by hand, while actually sorting each
// item, same as any other Hopper item regardless of where it came from.

export type NormalizedHopperImportRow = {
  imageUrl: string;
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

  // Accepts either "Image URL" or "URL" for the required column, and
  // either "Title" or "Name" for the optional one — the same loose
  // matching spirit as the Artwork import, without assuming any one
  // export format.
  const rows: NormalizedHopperImportRow[] = result.data
    .map((r) => ({
      imageUrl: repairDoubledUrl((r["Image URL"] || r["URL"] || "").trim()),
      title: (r["Title"] || r["Name"] || "").trim(),
    }))
    .filter((r) => r.imageUrl);

  return { rows, parseErrors };
}

export async function importHopperCsvRow(
  artistId: string,
  siteId: string,
  row: NormalizedHopperImportRow
): Promise<{ ok: true } | { ok: false; error: string }> {
  const imageResult = await fetchAndUploadImage(artistId, row.imageUrl);
  if ("error" in imageResult) return { ok: false, error: imageResult.error };

  await db.image.create({
    data: {
      artistId,
      key: imageResult.key,
      url: imageResult.url,
      thumbnailKey: imageResult.thumbnailKey,
      displayKey: imageResult.displayKey,
      kind: "PHOTO",
      mimeType: imageResult.mimeType,
      status: "HOPPER",
      source: "CSV import",
      caption: row.title || null,
    },
  });

  revalidatePath(`/sites/${siteId}/hopper`);
  return { ok: true };
}
