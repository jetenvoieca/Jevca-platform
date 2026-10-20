import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { saleBreakdown, saleTitle } from "@/lib/saleMath";
import { formatInvoiceNumber } from "@/lib/invoiceNumber";
import { addressLines, currencySymbol, embedLogo, fitText } from "@/lib/pdfParts";
import { liveInvoiceNumber, loadStatement } from "@/lib/statements";

// A statement's PDF (2026-10-20) — same look as the invoice
// (lib/actions/invoice.ts): logo, "Statement" and its date, the artist,
// the gallery, then one line per work still owed — when it sold, its
// invoice (or "not invoiced"), how many days since it sold, and what's
// owed — and the total per currency. A work paid since the statement was
// made shows as paid. The artist's invoice footer (bank details) closes
// it. Language: the gallery's own, else the artist's invoice language.

const LABELS = {
  EN: {
    statement: "Statement",
    date: "Date",
    to: "To:",
    sold: "Sold",
    work: "Work",
    invoice: "Invoice",
    notInvoiced: "Not invoiced",
    days: "Days",
    owed: "Amount owed",
    paid: "Paid",
    instalments: "By instalments",
    totalOwed: "Total owed",
    vatNo: "VAT No",
  },
  FR: {
    statement: "Relevé",
    date: "Date",
    to: "À :",
    sold: "Vendu",
    work: "Œuvre",
    invoice: "Facture",
    notInvoiced: "Non facturé",
    days: "Jours",
    owed: "Montant dû",
    paid: "Payé",
    instalments: "En plusieurs fois",
    totalOwed: "Total dû",
    vatNo: "N° TVA",
  },
} as const;

const DAY = 24 * 60 * 60 * 1000;

export async function generateStatementPdf(
  statementId: string
): Promise<{ bytes: Uint8Array; filename: string }> {
  const statement = await loadStatement(statementId);
  if (!statement) throw new Error("Statement not found.");
  const { artist, customer } = statement;
  const sales = statement.lines.map((l) => l.purchase);

  const lang = (customer.language || artist.invoiceLanguage) === "FR" ? "FR" : "EN";
  const t = LABELS[lang];
  const dateLocale = lang === "FR" ? "fr-FR" : "en-GB";
  const now = Date.now();

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const grey = rgb(0.45, 0.45, 0.45);
  const A4: [number, number] = [595.28, 841.89];
  let page: PDFPage = doc.addPage(A4);
  const { width, height } = page.getSize();
  const left = 50;
  const right = width - 50;
  let y = height - 60;

  const textRightAt = (x: number, text: string, f: PDFFont = font, size = 10, color = rgb(0, 0, 0)) => {
    page.drawText(text, { x: x - f.widthOfTextAtSize(text, size), y, size, font: f, color });
  };
  const ensureSpace = (needed: number) => {
    if (y - needed >= 60) return;
    page = doc.addPage(A4);
    y = height - 60;
  };
  const drawRule = () => {
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  };
  const money = (n: number, currency: string) => `${currencySymbol(currency)}${n.toFixed(2)}`;

  // ---- Logo, title and date ----
  const logo = await embedLogo(doc, artist.logoUrl);
  if (logo) {
    const logoHeight = 50;
    const scale = logoHeight / logo.height;
    page.drawImage(logo, { x: left, y: y - logoHeight + 12, width: logo.width * scale, height: logoHeight });
  }
  textRightAt(right, t.statement, bold, 16);
  y -= 18;
  textRightAt(right, `${t.date}: ${statement.createdAt.toLocaleDateString(dateLocale)}`, font, 10, grey);
  y -= 60;

  // ---- From (the artist) ----
  page.drawText(artist.name, { x: left, y, size: 11, font: bold });
  y -= 14;
  for (const line of [...addressLines(artist), artist.email, artist.vatNumber ? `${t.vatNo}: ${artist.vatNumber}` : null]) {
    if (!line) continue;
    page.drawText(line, { x: left, y, size: 10, font });
    y -= 13;
  }
  y -= 20;

  // ---- To (the gallery) ----
  page.drawText(t.to, { x: left, y, size: 9, font, color: grey });
  y -= 13;
  page.drawText(customer.name, { x: left, y, size: 11, font: bold });
  y -= 14;
  for (const line of (customer.address || "").split("\n").filter(Boolean)) {
    page.drawText(line, { x: left, y, size: 10, font });
    y -= 13;
  }
  y -= 30;

  // ---- One line per work ----
  const colWork = left + 70;
  const colInvoice = 380;
  const colDays = 430;
  page.drawText(t.sold, { x: left, y, size: 9, font, color: grey });
  page.drawText(t.work, { x: colWork, y, size: 9, font, color: grey });
  page.drawText(t.invoice, { x: colInvoice - 40, y, size: 9, font, color: grey });
  textRightAt(colDays + 20, t.days, font, 9, grey);
  textRightAt(right, t.owed, font, 9, grey);
  y -= 8;
  drawRule();
  y -= 18;

  const totals = new Map<string, number>();
  for (const sale of sales) {
    ensureSpace(20);
    const owed = sale.status === "ACTIVE" ? saleBreakdown(sale).balance : 0;
    if (owed > 0) totals.set(sale.currency, (totals.get(sale.currency) ?? 0) + owed);
    const invoiceNumber = liveInvoiceNumber(sale);
    page.drawText(sale.createdAt.toLocaleDateString(dateLocale), { x: left, y, size: 10, font });
    page.drawText(fitText(saleTitle(sale.artwork.catalogueName, sale.chargeKind), colInvoice - colWork - 50, font, 10), {
      x: colWork,
      y,
      size: 10,
      font,
    });
    page.drawText(invoiceNumber ? formatInvoiceNumber(invoiceNumber) : t.notInvoiced, {
      x: colInvoice - 40,
      y,
      size: 9,
      font,
      color: invoiceNumber ? rgb(0, 0, 0) : grey,
    });
    if (owed > 0) {
      textRightAt(colDays + 20, String(Math.max(Math.floor((now - sale.createdAt.getTime()) / DAY), 0)));
      textRightAt(right, money(owed, sale.currency));
    } else {
      textRightAt(right, t.paid, font, 10, rgb(0.1, 0.5, 0.2));
    }
    if (owed > 0 && sale.stripeSubscriptionScheduleId) {
      y -= 12;
      page.drawText(t.instalments, { x: colWork, y, size: 8, font, color: grey });
    }
    y -= 20;
  }

  y += 4;
  drawRule();
  y -= 22;
  for (const [currency, amount] of totals) {
    ensureSpace(16);
    page.drawText(t.totalOwed, { x: left, y, size: 10, font: bold });
    textRightAt(right, money(amount, currency), bold);
    y -= 16;
  }
  y -= 20;

  // ---- Footer (the artist's own words, e.g. bank details) ----
  if (artist.invoiceFooterText) {
    const footer = artist.invoiceFooterText.split("\n");
    ensureSpace(20 + footer.length * 12);
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: rgb(0.92, 0.92, 0.92) });
    y -= 20;
    for (const line of footer) {
      page.drawText(line, { x: left, y, size: 9, font, color: grey });
      y -= 12;
    }
  }

  const bytes = await doc.save();
  const stamp = statement.createdAt.toISOString().slice(0, 10);
  return { bytes, filename: `statement-${stamp}.pdf` };
}
