"use server";

import { db } from "@/lib/db";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { APP_URL } from "@/lib/stripe";

// Certificate of Authenticity PDF (2026-09-03) — its own generator file,
// deliberately separate from invoice.ts: this is a different document
// with a different purpose (proving authenticity, not requesting/
// recording payment), only ever offered once a sale is COMPLETED, and
// with its own set of fields (Artist/Title/Details/Image Size, a
// certifying paragraph, a signature) that have nothing in common with
// an invoice's line items and totals. Reuses the same pdf-lib approach
// and the artist's existing Logo for the letterhead, since visually it
// should still look like it came from the same studio.

// Finds the certifying text for this artwork's Type — matched the same
// free-text way ArtworkType/isEditionType elsewhere in the app match
// against a Type string: an exact match first (case-insensitive), then
// a substring match either direction, so "Giclée Edition" still finds a
// template labelled "Edition". No silent fallback to some other
// template if nothing matches — a wrong certifying statement is worse
// than no certificate at all, so this surfaces as an error the person
// has to actually resolve in Settings.
function findMatchingTemplate(
  templates: { label: string; text: string }[],
  artworkType: string | null
) {
  const type = (artworkType || "").trim().toLowerCase();
  if (!type) return null;
  const exact = templates.find((t) => t.label.trim().toLowerCase() === type);
  if (exact) return exact;
  return (
    templates.find(
      (t) =>
        type.includes(t.label.trim().toLowerCase()) || t.label.trim().toLowerCase().includes(type)
    ) ?? null
  );
}

// pdf-lib doesn't wrap text itself — the certifying paragraph can be any
// length the artist typed, so this splits it into lines that fit within
// maxWidth and draws each one centred, returning the y position after
// the last line.
function drawWrappedCentered(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  centerX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number
): number {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let y = startY;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      page.drawText(line, { x: centerX - font.widthOfTextAtSize(line, size) / 2, y, size, font });
      y -= lineHeight;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) {
    page.drawText(line, { x: centerX - font.widthOfTextAtSize(line, size) / 2, y, size, font });
    y -= lineHeight;
  }
  return y;
}

// Best-effort image embed — used for both the letterhead logo and the
// signature. Returns null on any failure (missing file, fetch error,
// unsupported format) so the document still generates without it rather
// than failing the whole certificate over a decorative image.
async function embedImageFromUrl(doc: PDFDocument, url: string | null) {
  if (!url) return null;
  try {
    const fullUrl = url.startsWith("http") ? url : `${APP_URL}${url}`;
    const res = await fetch(fullUrl);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "";
    return contentType.includes("png") ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

export async function generateCertificatePdf(
  purchaseId: string
): Promise<{ bytes: Uint8Array; filename: string }> {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    relationLoadStrategy: "query",
    include: { artwork: { include: { artist: { include: { certificateTemplates: true } } } } },
  });
  if (!purchase) throw new Error("Sale not found.");
  if (purchase.status !== "COMPLETED") {
    throw new Error("This sale hasn't been marked as paid yet — a certificate can't be issued until it has.");
  }

  const artwork = purchase.artwork;
  const artist = artwork.artist;

  const template = findMatchingTemplate(artist.certificateTemplates, artwork.type);
  if (!template) {
    throw new Error(
      artwork.type
        ? `No certificate template matches this artwork's Type ("${artwork.type}") — add one in Settings → Financial → Certificate of Authenticity.`
        : "This artwork has no Type set, so no certificate template can be matched — set a Type on the Catalogue tab first."
    );
  }

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const grey = rgb(0.45, 0.45, 0.45);
  const left = 70;
  const centerX = width / 2;
  let y = height - 70;

  // ---- Letterhead logo, centered ----
  const logo = await embedImageFromUrl(doc, artist.logoUrl);
  if (logo) {
    const logoHeight = 60;
    const scale = logoHeight / logo.height;
    const logoWidth = logo.width * scale;
    page.drawImage(logo, { x: centerX - logoWidth / 2, y: y - logoHeight, width: logoWidth, height: logoHeight });
    y -= logoHeight + 40;
  } else {
    y -= 20;
  }

  // ---- Title ----
  const title = "Certificate of Authenticity";
  page.drawText(title, {
    x: centerX - bold.widthOfTextAtSize(title, 18) / 2,
    y,
    size: 18,
    font: bold,
  });
  y -= 60;

  // ---- Artist / Title / Details / Image Size ----
  const fields: [string, string][] = [
    ["Artist :", artist.name],
    ["Title:", artwork.presentationTitle],
    ["Details:", artwork.presentationMedium || artwork.medium || "—"],
    ["Image Size:", artwork.size || "—"],
  ];
  const valueX = left + 110;
  for (const [label, value] of fields) {
    page.drawText(label, { x: left, y, size: 11, font: bold });
    page.drawText(value, { x: valueX, y, size: 11, font });
    y -= 20;
  }
  y -= 40;

  // ---- Certifying statement — the matched template's own text ----
  y = drawWrappedCentered(page, template.text, font, 12, centerX, y, width - left * 2, 18);
  y -= 50;

  // ---- Signed, with the artist's signature image beneath ----
  page.drawText("Signed …", { x: left, y, size: 11, font });
  y -= 10;
  const signature = await embedImageFromUrl(doc, artist.signatureUrl);
  if (signature) {
    const sigHeight = 50;
    const scale = sigHeight / signature.height;
    page.drawImage(signature, { x: left, y: y - sigHeight, width: signature.width * scale, height: sigHeight });
  }

  // ---- Footer ----
  const footerParts = [`${artist.name} Studio`, artist.email].filter(Boolean);
  if (footerParts.length > 0) {
    const footer = footerParts.join(" | ");
    page.drawText(footer, {
      x: centerX - font.widthOfTextAtSize(footer, 9) / 2,
      y: 50,
      size: 9,
      font,
      color: grey,
    });
  }

  const bytes = await doc.save();
  const safeTitle = artwork.presentationTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return { bytes, filename: `certificate-${safeTitle || purchase.id}.pdf` };
}
