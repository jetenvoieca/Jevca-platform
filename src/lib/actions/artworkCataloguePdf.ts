"use server";

import { db } from "@/lib/db";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { publicMediaUrl } from "@/lib/r2";
import { buildArtworkWhere, buildArtworkOrderBy } from "@/lib/artworkFilters";

export type CatalogueExportFilters = {
  q?: string;
  availability?: string;
  location?: string;
  type?: string;
  group?: string;
  sort?: string;
};

// Printed catalogue / price list: a 2-column grid, image on top of its
// details in each cell (targets ~7-8 entries per A4 page - 2026-08-15,
// tuned down from an earlier single-column version that only fit ~3).
// Images use the derived thumbnailKey/displayKey (2026-08-15 fix) -
// Image.url is actually a relative, session-authenticated proxy path
// (/api/media/[key]), not a fetchable public URL, which is why no
// images were coming through before. thumbnailKey/displayKey are
// resized by width only with no cropping (see imageSizes.ts), so
// they're already exactly the "uncropped, correct proportions" images
// this needs - not a compromise standing in for the true original.
export async function generateArtworkCataloguePdf(
  artistId: string,
  artistName: string,
  filters: CatalogueExportFilters
): Promise<{ bytes: Uint8Array; filename: string }> {
  const where = buildArtworkWhere(artistId, filters);
  const orderBy = buildArtworkOrderBy(filters.sort);

  const artworks = await db.artwork.findMany({
    where,
    orderBy,
    select: {
      catalogueName: true,
      catalogueNumber: true,
      type: true,
      medium: true,
      size: true,
      presentationPrice: true,
      priceFramed: true,
      availability: true,
      images: { take: 1, select: { thumbnailKey: true, displayKey: true } },
    },
  });

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const grey = rgb(0.45, 0.45, 0.45);
  const black = rgb(0.1, 0.1, 0.1);

  const pageWidth = 595.28;
  const pageHeight = 841.89; // A4
  const margin = 40;
  const columns = 2;
  const columnGap = 20;
  const rowGap = 14;
  const columnWidth = (pageWidth - margin * 2 - columnGap * (columns - 1)) / columns;
  const imageBoxHeight = 100; // "medium" - tuned for ~8 entries/page across 4 rows
  const rowHeight = imageBoxHeight + 50; // + space for ~4 lines of text below

  let page!: PDFPage;
  let y = 0;
  let col = 0;

  const filterSummary = describeFilters(filters);

  const drawHeader = () => {
    page = doc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
    col = 0;
    page.drawText(artistName, { x: margin, y, size: 18, font: bold, color: black });
    y -= 22;
    page.drawText("Artwork Catalogue", { x: margin, y, size: 11, font, color: grey });
    y -= 14;
    const today = new Date().toLocaleDateString("en-GB");
    page.drawText(filterSummary ? `${today} - ${filterSummary}` : today, {
      x: margin,
      y,
      size: 9,
      font,
      color: grey,
    });
    y -= 20;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.5,
      color: grey,
    });
    y -= 20;
  };

  drawHeader();

  for (const a of artworks) {
    const imageUrl =
      publicMediaUrl(a.images[0]?.displayKey) || publicMediaUrl(a.images[0]?.thumbnailKey);
    let embedded: Awaited<ReturnType<typeof doc.embedJpg>> | null = null;
    let scaledW = 0;
    let scaledH = 0;
    if (imageUrl) {
      try {
        const res = await fetch(imageUrl);
        if (res.ok) {
          const bytes = new Uint8Array(await res.arrayBuffer());
          const contentType = res.headers.get("content-type") || "";
          embedded = contentType.includes("png")
            ? await doc.embedPng(bytes)
            : await doc.embedJpg(bytes);
          const scale = Math.min(columnWidth / embedded.width, imageBoxHeight / embedded.height);
          scaledW = embedded.width * scale;
          scaledH = embedded.height * scale;
        }
      } catch {
        // Skip this one image rather than fail the whole export over it.
        embedded = null;
      }
    }

    if (col === 0 && y - rowHeight < margin) {
      drawHeader();
    }

    const cellX = margin + col * (columnWidth + columnGap);
    const cellTop = y;

    if (embedded) {
      page.drawImage(embedded, {
        x: cellX + (columnWidth - scaledW) / 2,
        y: cellTop - imageBoxHeight + (imageBoxHeight - scaledH) / 2,
        width: scaledW,
        height: scaledH,
      });
    } else {
      page.drawRectangle({
        x: cellX,
        y: cellTop - imageBoxHeight,
        width: columnWidth,
        height: imageBoxHeight,
        borderColor: grey,
        borderWidth: 0.5,
      });
    }

    let textY = cellTop - imageBoxHeight - 14;
    for (const line of buildTextLines(a)) {
      page.drawText(line.text, {
        x: cellX,
        y: textY,
        size: line.size,
        font: line.bold ? bold : font,
        color: line.grey ? grey : black,
        maxWidth: columnWidth,
      });
      textY -= line.size + 3;
    }

    if (col === columns - 1) {
      col = 0;
      y -= rowHeight + rowGap;
    } else {
      col += 1;
    }
  }

  if (artworks.length === 0) {
    page.drawText("No artworks match the current filters.", {
      x: margin,
      y,
      size: 11,
      font,
      color: grey,
    });
  }

  const bytes = await doc.save();
  const dateStamp = new Date().toISOString().slice(0, 10);
  return { bytes, filename: `artwork-catalogue-${dateStamp}.pdf` };
}

function buildTextLines(a: {
  catalogueName: string;
  catalogueNumber: string;
  type: string | null;
  medium: string | null;
  size: string | null;
  presentationPrice: { toString(): string } | null;
  priceFramed: { toString(): string } | null;
  availability: string;
}): { text: string; size: number; bold?: boolean; grey?: boolean }[] {
  const lines: { text: string; size: number; bold?: boolean; grey?: boolean }[] = [
    { text: a.catalogueName, size: 11, bold: true },
    { text: a.catalogueNumber, size: 8, grey: true },
  ];
  const details = [a.type, a.medium, a.size].filter(Boolean).join(" · ");
  if (details) lines.push({ text: details, size: 9, grey: true });

  const unframed = a.presentationPrice != null ? a.presentationPrice.toString() : null;
  const framed = a.priceFramed != null ? a.priceFramed.toString() : null;
  if (unframed && framed) {
    lines.push({ text: `Unframed £${unframed} · Framed £${framed}`, size: 9 });
  } else if (unframed) {
    lines.push({ text: `£${unframed}`, size: 9 });
  }

  if (a.availability !== "AVAILABLE") {
    lines.push({
      text: a.availability === "SOLD" ? "Sold" : "Reserved",
      size: 8,
      grey: true,
    });
  }
  return lines;
}

function describeFilters(filters: CatalogueExportFilters): string {
  const parts: string[] = [];
  if (filters.q) parts.push(`Search: "${filters.q}"`);
  if (filters.availability) parts.push(filters.availability === "SOLD" ? "Sold" : "Available");
  if (filters.type) parts.push(`Type: ${filters.type}`);
  if (filters.group) parts.push(`Group: ${filters.group}`);
  if (filters.location) parts.push(`Location: ${filters.location}`);
  return parts.join(" · ");
}
