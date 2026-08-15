"use server";

import { db } from "@/lib/db";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { buildArtworkWhere, buildArtworkOrderBy } from "@/lib/artworkFilters";

export type CatalogueExportFilters = {
  q?: string;
  availability?: string;
  location?: string;
  type?: string;
  group?: string;
  sort?: string;
};

// Printed catalogue / price list, one entry per artwork: an uncropped
// image (scaled to fit a medium bounding box, aspect ratio preserved —
// deliberately not the square grid thumbnail, which crops; a portrait
// or landscape piece needs to actually look like one here) alongside
// its name, catalogue number, type/medium/size, price(s), and
// availability. Filters use the exact same buildArtworkWhere the
// on-screen grid does (2026-08-15), so "export respects filters" holds
// precisely rather than approximately.
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
      images: { take: 1, select: { url: true } },
    },
  });

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const grey = rgb(0.45, 0.45, 0.45);
  const black = rgb(0.1, 0.1, 0.1);

  const pageWidth = 595.28;
  const pageHeight = 841.89; // A4
  const margin = 50;
  const imageBoxSize = 150; // medium — the bounding box images scale to fit within
  const textX = margin + imageBoxSize + 20;
  const textWidth = pageWidth - margin - textX;

  let page!: PDFPage;
  let y = 0;

  const filterSummary = describeFilters(filters);

  const drawHeader = () => {
    page = doc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
    page.drawText(artistName, { x: margin, y, size: 18, font: bold, color: black });
    y -= 22;
    page.drawText("Artwork Catalogue", { x: margin, y, size: 11, font, color: grey });
    y -= 14;
    const today = new Date().toLocaleDateString("en-GB");
    page.drawText(filterSummary ? `${today} — ${filterSummary}` : today, {
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
    // Fetch the ORIGINAL image, not the square grid thumbnail — this is
    // the one place in the app that deliberately shows uncropped,
    // correctly-proportioned images (2026-08-15 decision).
    let embedded: Awaited<ReturnType<typeof doc.embedJpg>> | null = null;
    let scaledW = 0;
    let scaledH = 0;
    if (a.images[0]?.url) {
      try {
        const res = await fetch(a.images[0].url);
        if (res.ok) {
          const bytes = new Uint8Array(await res.arrayBuffer());
          const contentType = res.headers.get("content-type") || "";
          embedded = contentType.includes("png")
            ? await doc.embedPng(bytes)
            : await doc.embedJpg(bytes);
          const scale = Math.min(imageBoxSize / embedded.width, imageBoxSize / embedded.height);
          scaledW = embedded.width * scale;
          scaledH = embedded.height * scale;
        }
      } catch {
        // Skip this one image rather than fail the whole export over it.
        embedded = null;
      }
    }

    const lines = buildTextLines(a);
    const textHeight = lines.length * 14 + 6;
    const entryHeight = Math.max(imageBoxSize, textHeight);

    if (y - entryHeight < margin) {
      drawHeader();
    }

    const entryTop = y;
    if (embedded) {
      page.drawImage(embedded, {
        x: margin + (imageBoxSize - scaledW) / 2,
        y: entryTop - imageBoxSize + (imageBoxSize - scaledH) / 2,
        width: scaledW,
        height: scaledH,
      });
    } else {
      page.drawRectangle({
        x: margin,
        y: entryTop - imageBoxSize,
        width: imageBoxSize,
        height: imageBoxSize,
        borderColor: grey,
        borderWidth: 0.5,
      });
    }

    let textY = entryTop - 4;
    for (const line of lines) {
      page.drawText(line.text, {
        x: textX,
        y: textY,
        size: line.size,
        font: line.bold ? bold : font,
        color: line.grey ? grey : black,
        maxWidth: textWidth,
      });
      textY -= line.size + 4;
    }

    y = entryTop - entryHeight - 24;
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
    { text: a.catalogueName, size: 13, bold: true },
    { text: a.catalogueNumber, size: 9, grey: true },
  ];
  const details = [a.type, a.medium, a.size].filter(Boolean).join(" · ");
  if (details) lines.push({ text: details, size: 10, grey: true });

  const unframed = a.presentationPrice != null ? a.presentationPrice.toString() : null;
  const framed = a.priceFramed != null ? a.priceFramed.toString() : null;
  if (unframed && framed) {
    lines.push({ text: `Unframed £${unframed}  ·  Framed £${framed}`, size: 10 });
  } else if (unframed) {
    lines.push({ text: `£${unframed}`, size: 10 });
  }

  if (a.availability !== "AVAILABLE") {
    lines.push({
      text: a.availability === "SOLD" ? "Sold" : "Reserved",
      size: 9,
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
