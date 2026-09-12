"use server";

import { db } from "@/lib/db";
import Papa from "papaparse";
import { publicMediaUrl } from "@/lib/r2";
import { buildArtworkWhere, buildArtworkOrderBy, type ArtworkFilterInput } from "@/lib/artworkFilters";

// CSV export (2026-09-11, direct request) — the counterpart to the
// existing CSV import (artworkImport.ts). Deliberately the exact same
// column set and header names that importer expects (Title, Image URL,
// Price, Dimensions, Medium, Location, Tier, Group, Type, Description,
// Sold, Notes) — a file exported from here re-imports cleanly through
// that same importer, so this doubles as a round-trip/backup path, not
// just a one-way report. Respects the same filters as the PDF export
// (buildArtworkWhere/buildArtworkOrderBy, shared with the on-screen grid
// — see artworkFilters.ts), so "export what I'm currently looking at"
// behaves the same way in both formats.
export async function generateArtworkCatalogueCsv(
  artistId: string,
  filters: ArtworkFilterInput
): Promise<{ csv: string; filename: string }> {
  const where = buildArtworkWhere(artistId, filters);
  const orderBy = buildArtworkOrderBy();

  const artworks = await db.artwork.findMany({
    where,
    orderBy,
    select: {
      presentationTitle: true,
      presentationPrice: true,
      size: true,
      medium: true,
      location: true,
      tier: true,
      catalogueGroup: true,
      type: true,
      description: true,
      availability: true,
      studioNotes: true,
      mainImage: { select: { key: true, displayKey: true, thumbnailKey: true } },
      images: { take: 1, select: { key: true, displayKey: true, thumbnailKey: true } },
    },
  });

  const rows = artworks.map((a) => {
    const img = a.mainImage || a.images[0];
    // Prefers the original upload (`key`) over the derived display/
    // thumbnail sizes, unlike the PDF export — a re-import fetching this
    // URL should get the best available copy, not a resized one.
    const imageUrl =
      publicMediaUrl(img?.key) ||
      publicMediaUrl(img?.displayKey) ||
      publicMediaUrl(img?.thumbnailKey) ||
      "";
    return {
      Title: a.presentationTitle,
      "Image URL": imageUrl,
      Price: a.presentationPrice != null ? a.presentationPrice.toString() : "",
      Dimensions: a.size || "",
      Medium: a.medium || "",
      Location: a.location || "",
      Tier: a.tier || "",
      Group: a.catalogueGroup || "",
      Type: a.type || "",
      Description: a.description || "",
      Sold: a.availability === "SOLD" ? "Yes" : "No",
      Notes: a.studioNotes || "",
    };
  });

  const csv = Papa.unparse(rows, {
    columns: [
      "Title",
      "Image URL",
      "Price",
      "Dimensions",
      "Medium",
      "Location",
      "Tier",
      "Group",
      "Type",
      "Description",
      "Sold",
      "Notes",
    ],
  });

  const dateStamp = new Date().toISOString().slice(0, 10);
  return { csv, filename: `artwork-catalogue-${dateStamp}.csv` };
}
