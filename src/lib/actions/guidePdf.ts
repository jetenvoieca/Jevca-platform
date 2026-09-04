"use server";

import { db } from "@/lib/db";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { APP_URL } from "@/lib/stripe";
import type { GuideStep } from "@/lib/actions/guides";

// Guide PDF (2026-09-04) — same pdf-lib approach as invoice.ts/
// certificate.ts, but its own generator: a guide isn't a financial
// document, so it has no letterhead, totals, or artist-specific fields —
// just a title and numbered steps, each with optional wrapped text and
// an optional image.

const PAGE_SIZE: [number, number] = [595.28, 841.89]; // A4
const MARGIN = 60;

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

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

export async function generateGuidePdf(
  guideId: string
): Promise<{ bytes: Uint8Array; filename: string }> {
  const guide = await db.guide.findUnique({ where: { id: guideId } });
  if (!guide) throw new Error("Guide not found.");

  const steps = (Array.isArray(guide.steps) ? guide.steps : []) as unknown as GuideStep[];

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const contentWidth = PAGE_SIZE[0] - MARGIN * 2;

  let page: PDFPage = doc.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - MARGIN;

  const newPageIfNeeded = (neededHeight: number) => {
    if (y - neededHeight < MARGIN) {
      page = doc.addPage(PAGE_SIZE);
      y = PAGE_SIZE[1] - MARGIN;
    }
  };

  // ---- Title ----
  const titleSize = 20;
  const titleLines = wrapLines(guide.title, bold, titleSize, contentWidth);
  for (const line of titleLines) {
    newPageIfNeeded(titleSize + 6);
    page.drawText(line, { x: MARGIN, y, size: titleSize, font: bold });
    y -= titleSize + 6;
  }
  y -= 20;

  // ---- Steps, numbered ----
  const textSize = 12;
  const lineHeight = 17;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const label = `${i + 1}.`;
    const labelWidth = bold.widthOfTextAtSize(label, textSize) + 10;
    const lines = wrapLines(step.text || "", font, textSize, contentWidth - labelWidth);

    newPageIfNeeded(lineHeight * Math.max(lines.length, 1) + 10);
    page.drawText(label, { x: MARGIN, y, size: textSize, font: bold });
    for (const line of lines) {
      newPageIfNeeded(lineHeight);
      page.drawText(line, { x: MARGIN + labelWidth, y, size: textSize, font });
      y -= lineHeight;
    }
    y -= 6;

    if (step.imageUrl) {
      const image = await embedImageFromUrl(doc, step.imageUrl);
      if (image) {
        const maxImgWidth = contentWidth - labelWidth;
        const maxImgHeight = 220;
        const scale = Math.min(maxImgWidth / image.width, maxImgHeight / image.height, 1);
        const imgWidth = image.width * scale;
        const imgHeight = image.height * scale;
        newPageIfNeeded(imgHeight + 14);
        page.drawImage(image, {
          x: MARGIN + labelWidth,
          y: y - imgHeight,
          width: imgWidth,
          height: imgHeight,
        });
        y -= imgHeight + 14;
      }
    }
    y -= 8;
  }

  if (steps.length === 0) {
    page.drawText("No steps have been added to this guide yet.", {
      x: MARGIN,
      y,
      size: textSize,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  const bytes = await doc.save();
  const safeTitle = guide.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return { bytes, filename: `guide-${safeTitle || guide.id}.pdf` };
}
