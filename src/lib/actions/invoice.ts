"use server";

import { db } from "@/lib/db";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { APP_URL } from "@/lib/stripe";

// Assigned once, lazily, the first time an invoice is actually generated
// for a Purchase — re-downloading the same invoice later always returns
// the same number rather than incrementing again.
async function getOrAssignInvoiceNumber(purchaseId: string, artistId: string): Promise<number> {
  const existing = await db.purchase.findUnique({
    where: { id: purchaseId },
    select: { invoiceNumber: true },
  });
  if (existing?.invoiceNumber) return existing.invoiceNumber;

  // Not a true atomically-locked counter — Prisma's `increment` is a
  // single UPDATE though, so two invoices generated at the exact same
  // instant would still each get a distinct number; a real collision
  // would need two people clicking "Download invoice" simultaneously,
  // which isn't a realistic scenario for a one-person admin tool.
  const artist = await db.artist.update({
    where: { id: artistId },
    data: { nextInvoiceNumber: { increment: 1 } },
    select: { nextInvoiceNumber: true },
  });
  const assigned = artist.nextInvoiceNumber - 1;
  await db.purchase.update({ where: { id: purchaseId }, data: { invoiceNumber: assigned } });
  return assigned;
}

function currencySymbol(currency: string) {
  return currency === "EUR" ? "€" : currency === "USD" ? "$" : "£";
}

export async function generateInvoicePdf(
  purchaseId: string
): Promise<{ bytes: Uint8Array; filename: string }> {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    relationLoadStrategy: "query",
    include: {
      artwork: { include: { artist: true } },
      payments: { orderBy: { sequence: "asc" } },
    },
  });
  if (!purchase) throw new Error("Purchase not found.");

  const artist = purchase.artwork.artist;
  const invoiceNumber = await getOrAssignInvoiceNumber(purchaseId, artist.id);

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const grey = rgb(0.45, 0.45, 0.45);
  const left = 50;
  const right = width - 50;
  let y = height - 60;

  const fmt = (n: number) => `${currencySymbol(purchase.currency)}${n.toFixed(2)}`;
  const rightAlign = (text: string, f = font, size = 10) =>
    right - f.widthOfTextAtSize(text, size);

  // ---- Logo (best-effort — an invoice still generates fine without one) ----
  if (artist.logoUrl) {
    try {
      const url = artist.logoUrl.startsWith("http") ? artist.logoUrl : `${APP_URL}${artist.logoUrl}`;
      const res = await fetch(url);
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        const contentType = res.headers.get("content-type") || "";
        const img = contentType.includes("png")
          ? await doc.embedPng(bytes)
          : await doc.embedJpg(bytes);
        const logoHeight = 50;
        const scale = logoHeight / img.height;
        page.drawImage(img, { x: left, y: y - logoHeight + 12, width: img.width * scale, height: logoHeight });
      }
    } catch {
      // Fetching or embedding the logo failed — proceed without it rather
      // than fail the whole invoice over a decorative image.
    }
  }

  // ---- Invoice number + date, top right ----
  const invoiceLabel = `Invoice #${String(invoiceNumber).padStart(7, "0")}`;
  page.drawText(invoiceLabel, { x: rightAlign(invoiceLabel, bold, 16), y, size: 16, font: bold });
  y -= 18;
  const dateLabel = `Issue date: ${new Date().toLocaleDateString("en-GB")}`;
  page.drawText(dateLabel, { x: rightAlign(dateLabel), y, size: 10, font, color: grey });

  y -= 60;

  // ---- From (the artist) ----
  page.drawText(artist.name, { x: left, y, size: 11, font: bold });
  y -= 14;
  for (const line of (artist.invoiceAddress || "").split("\n").filter(Boolean)) {
    page.drawText(line, { x: left, y, size: 10, font });
    y -= 13;
  }
  if (artist.email) {
    page.drawText(artist.email, { x: left, y, size: 10, font });
    y -= 13;
  }
  if (artist.vatNumber) {
    page.drawText(`VAT No: ${artist.vatNumber}`, { x: left, y, size: 10, font });
    y -= 13;
  }

  y -= 20;

  // ---- Bill to (the buyer) ----
  page.drawText("Bill to:", { x: left, y, size: 9, font, color: grey });
  y -= 13;
  page.drawText(purchase.buyerName || purchase.buyerEmail || "—", { x: left, y, size: 11, font: bold });
  y -= 14;
  for (const line of (purchase.buyerAddress || "").split("\n").filter(Boolean)) {
    page.drawText(line, { x: left, y, size: 10, font });
    y -= 13;
  }
  if (purchase.buyerEmail) {
    page.drawText(purchase.buyerEmail, { x: left, y, size: 10, font });
    y -= 13;
  }

  y -= 30;

  // ---- Line item ----
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 22;

  const total = parseFloat(purchase.totalAmount.toString());
  page.drawText(purchase.artwork.presentationTitle, { x: left, y, size: 11, font: bold });
  const totalLabel = fmt(total);
  page.drawText(totalLabel, { x: rightAlign(totalLabel, font, 11), y, size: 11, font });
  y -= 25;

  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 25;

  // ---- Totals — shape differs by channel ----
  const drawRow = (label: string, value: string, isBold = false) => {
    const f = isBold ? bold : font;
    page.drawText(label, { x: left, y, size: 10, font: f });
    page.drawText(value, { x: rightAlign(value, f), y, size: 10, font: f });
    y -= 16;
  };

  let invoiceTotal = total;
  let amountPaid = 0;

  if (purchase.channel === "GALLERY") {
    const commissionPercent = purchase.commissionPercent
      ? parseFloat(purchase.commissionPercent.toString())
      : 0;
    const commissionAmount = total * (commissionPercent / 100);
    const net = total - commissionAmount;
    invoiceTotal = net;
    drawRow("Sale price", fmt(total));
    drawRow(`Commission (${commissionPercent}%)`, `-${fmt(commissionAmount)}`);
    y -= 4;
    drawRow("Invoice total", fmt(net), true);
    amountPaid = purchase.status === "COMPLETED" ? net : 0;
  } else {
    // STRIPE — a record of what was (or will be) paid via card, not a
    // request for payment. VAT breakdown only shown if the artist has a
    // VAT number and rate on file.
    if (artist.vatNumber && artist.vatRate) {
      const vatRate = parseFloat(artist.vatRate.toString());
      const net = total / (1 + vatRate / 100);
      const vat = total - net;
      drawRow("Sale price (ex. VAT)", fmt(net));
      drawRow(`VAT (${vatRate}%)`, fmt(vat));
      y -= 4;
      drawRow("Total", fmt(total), true);
    } else {
      drawRow("Total", fmt(total), true);
    }
    amountPaid = purchase.payments
      .filter((p) => p.status === "PAID")
      .reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);
  }

  const balanceDue = invoiceTotal - amountPaid;
  y -= 6;
  drawRow("Amount paid", fmt(amountPaid));
  drawRow("Balance due", fmt(balanceDue), true);

  y -= 20;

  // ---- Status note ----
  const statusText =
    purchase.channel === "GALLERY"
      ? purchase.status === "COMPLETED"
        ? `Paid${purchase.closedAt ? " on " + new Date(purchase.closedAt).toLocaleDateString("en-GB") : ""}`
        : "UNPAID"
      : purchase.status === "COMPLETED"
        ? "Paid"
        : "Payment in progress";
  page.drawText(statusText, {
    x: left,
    y,
    size: 10,
    font: bold,
    color: statusText === "UNPAID" ? rgb(0.7, 0.2, 0.1) : rgb(0.1, 0.5, 0.2),
  });

  y -= 30;

  // ---- Footer (free text — VAT exemption notes, bank details, thank-you,
  // whatever the artist wants; deliberately not hard-coded) ----
  if (artist.invoiceFooterText) {
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: rgb(0.92, 0.92, 0.92) });
    y -= 20;
    for (const line of artist.invoiceFooterText.split("\n")) {
      page.drawText(line, { x: left, y, size: 9, font, color: grey });
      y -= 12;
    }
  }

  const bytes = await doc.save();
  return { bytes, filename: `invoice-${String(invoiceNumber).padStart(7, "0")}.pdf` };
}
