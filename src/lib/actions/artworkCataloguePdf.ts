"use server";

import { db } from "@/lib/db";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { publicMediaUrl } from "@/lib/r2";
import { buildArtworkWhere, buildArtworkOrderBy } from "@/lib/artworkFilters";

export type CatalogueExportFilters = {
  q?: string;
  availability?: string;
  location?: string;
  type?: string;
  group?: string;
  sort?: string;
  // Editable per-export, via ExportPdfDialog.tsx (2026-08-17) — default
  // to the artist's real name / "Artwork Catalogue" when absent, so one
  // export flow covers whatever this particular PDF is for instead of
  // needing several near-identical hard-coded templates.
  headerTitle?: string;
  headerSubtitle?: string;
};

type TextLine = { text: string; size: number; bold?: boolean; grey?: boolean };

// Breaks a line of text into as many visual lines as it takes to fit
// within maxWidth, breaking on word boundaries — pdf-lib's own drawText
// does NOT do this on its own; passing it a long string just runs the
// text past maxWidth rather than wrapping it. A single word that's wider
// than maxWidth on its own is left on its own line rather than infinite-
// looping or silently dropped.
function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(attempt, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = attempt;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

// Expands each logical text line (title, catalogue #, details, price,
// status) into its actual wrapped visual lines for the given width, and
// returns the total height they'll take up alongside the flat list ready
// to draw. This is the actual fix for the reported bug: the old version
// budgeted a single fixed guess (~4 lines' worth of space) for every
// entry's text regardless of how much text there actually was, so a
// longer title silently overlapped whatever was drawn next once it
// wrapped past that guess. Computing this for real, per entry, before
// deciding how tall that entry's row needs to be, is what makes the
// overrun impossible rather than just less likely.
function layoutTextLines(
  logicalLines: TextLine[],
  font: PDFFont,
  bold: PDFFont,
  maxWidth: number
): { lines: TextLine[]; height: number } {
  const lines: TextLine[] = [];
  let height = 0;
  for (const line of logicalLines) {
    const wrapped = wrapLine(line.text, line.bold ? bold : font, line.size, maxWidth);
    for (const text of wrapped) {
      lines.push({ ...line, text });
      height += line.size + 3;
    }
  }
  return { lines, height };
}

// Printed catalogue / price list. Image beside its details (not above
// them) — 2 pairs per row — rearranged 2026-08-17 from an earlier
// image-on-top-of-text version at direct request, after long titles/
// price lines wrapped past that version's fixed text-height guess and
// visibly ran into the row below. Images use the derived thumbnailKey/
// displayKey (2026-08-15 fix) - Image.url is actually a relative,
// session-authenticated proxy path (/api/media/[key]), not a fetchable
// public URL, which is why no images were coming through before.
// thumbnailKey/displayKey are resized by width only with no cropping
// (see imageSizes.ts), so they're already exactly the "uncropped,
// correct proportions" images this needs - not a compromise standing in
// for the true original.
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
      mainImage: { select: { thumbnailKey: true, displayKey: true } },
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
  const columnGap = 24;
  const rowGap = 18;
  const itemWidth = (pageWidth - margin * 2 - columnGap * (columns - 1)) / columns;
  const imageBoxSize = 100; // fixed square, left-hand side of each item
  const textGap = 14;
  const textWidth = itemWidth - imageBoxSize - textGap;

  let page!: PDFPage;
  let y = 0;

  const headerTitle = filters.headerTitle?.trim() || artistName;
  const headerSubtitle = filters.headerSubtitle ?? "Artwork Catalogue";
  const filterSummary = describeFilters(filters);

  const drawHeader = () => {
    page = doc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
    page.drawText(headerTitle, { x: margin, y, size: 18, font: bold, color: black });
    y -= 22;
    if (headerSubtitle) {
      page.drawText(headerSubtitle, { x: margin, y, size: 11, font, color: grey });
      y -= 14;
    }
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

  // Fetches and embeds an artwork's image, and lays out its wrapped text
  // — everything needed to know how tall this one item will end up
  // being, before anything is actually drawn.
  const prepareItem = async (a: (typeof artworks)[number]) => {
    const effectiveImage = a.mainImage || a.images[0];
    const imageUrl =
      publicMediaUrl(effectiveImage?.displayKey) || publicMediaUrl(effectiveImage?.thumbnailKey);
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
          const scale = Math.min(imageBoxSize / embedded.width, imageBoxSize / embedded.height);
          scaledW = embedded.width * scale;
          scaledH = embedded.height * scale;
        }
      } catch {
        // Skip this one image rather than fail the whole export over it.
        embedded = null;
      }
    }
    const { lines, height: textHeight } = layoutTextLines(
      buildTextLines(a),
      font,
      bold,
      textWidth
    );
    return {
      embedded,
      scaledW,
      scaledH,
      lines,
      itemHeight: Math.max(imageBoxSize, textHeight),
    };
  };

  const drawItem = (
    item: Awaited<ReturnType<typeof prepareItem>>,
    cellX: number,
    cellTop: number
  ) => {
    if (item.embedded) {
      page.drawImage(item.embedded, {
        x: cellX + (imageBoxSize - item.scaledW) / 2,
        y: cellTop - imageBoxSize + (imageBoxSize - item.scaledH) / 2,
        width: item.scaledW,
        height: item.scaledH,
      });
    } else {
      page.drawRectangle({
        x: cellX,
        y: cellTop - imageBoxSize,
        width: imageBoxSize,
        height: imageBoxSize,
        borderColor: grey,
        borderWidth: 0.5,
      });
    }

    const textX = cellX + imageBoxSize + textGap;
    // Text starts level with the top of the image, not vertically
    // centred against it — matches the requested layout and keeps every
    // row's text starting at a consistent, scannable height regardless
    // of how tall that particular item's text block ends up being.
    let textY = cellTop - font.heightAtSize(11);
    for (const line of item.lines) {
      page.drawText(line.text, {
        x: textX,
        y: textY,
        size: line.size,
        font: line.bold ? bold : font,
        color: line.grey ? grey : black,
      });
      textY -= line.size + 3;
    }
  };

  for (let i = 0; i < artworks.length; i += columns) {
    const pair = artworks.slice(i, i + columns);
    const items: Awaited<ReturnType<typeof prepareItem>>[] = await Promise.all(
      pair.map(prepareItem)
    );
    const rowHeight = Math.max(...items.map((it: Awaited<ReturnType<typeof prepareItem>>) => it.itemHeight));

    if (y - rowHeight < margin) {
      drawHeader();
    }

    items.forEach((item: Awaited<ReturnType<typeof prepareItem>>, col: number) => {
      const cellX = margin + col * (itemWidth + columnGap);
      drawItem(item, cellX, y);
    });

    y -= rowHeight + rowGap;
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
}): TextLine[] {
  const lines: TextLine[] = [
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
