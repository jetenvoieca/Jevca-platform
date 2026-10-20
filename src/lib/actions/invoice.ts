import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { saleBreakdown, saleTitle } from "@/lib/saleMath";
import { invoiceExtras, loadInvoice } from "@/lib/invoices";
import { formatInvoiceNumber } from "@/lib/invoiceNumber";
import { addressLines, currencySymbol, embedLogo, fitText } from "@/lib/pdfParts";

// Not a "use server" file (2026-10-14): only the invoice route and the
// invoice email call this, on the server, so it isn't offered to the
// browser as an action.

// Document wording (2026-08-13). Language is the customer's own choice
// if they have one, else the artist's (Settings → Invoice language) —
// deliberately not inferred from the currency, since currency and the
// buyer's language aren't the same thing.
const LABELS = {
  EN: {
    invoice: "Invoice",
    receipt: "Receipt",
    issueDate: "Issue date",
    billTo: "Bill to:",
    work: "Work",
    salePrice: "Sale price",
    commission: "Commission",
    net: "Net",
    deposit: "Deposit paid",
    framing: "Framing",
    delivery: "Delivery",
    invoiceTotal: "Invoice total",
    total: "Total",
    salePriceExVat: "Sale price (ex. VAT)",
    vat: "VAT",
    amountPaid: "Amount paid",
    balanceDue: "Balance due",
    paidOn: "Paid on",
    paymentInProgress: "Payment in progress",
    cancelled: "Cancelled",
    vatNo: "VAT No",
    receivedWithThanks: "Received with Thanks",
  },
  FR: {
    invoice: "Facture",
    receipt: "Reçu",
    issueDate: "Date d'émission",
    billTo: "Facturé à :",
    work: "Œuvre",
    salePrice: "Prix de vente",
    commission: "Commission",
    net: "Net",
    deposit: "Acompte versé",
    framing: "Encadrement",
    delivery: "Livraison",
    invoiceTotal: "Total facture",
    total: "Total",
    salePriceExVat: "Prix de vente (HT)",
    vat: "TVA",
    amountPaid: "Montant payé",
    balanceDue: "Solde dû",
    paidOn: "Payé le",
    paymentInProgress: "Paiement en cours",
    cancelled: "Annulée",
    vatNo: "N° TVA",
    receivedWithThanks: "Reçu avec nos remerciements",
  },
} as const;

// The invoice's PDF (2026-10-14: one document for every sale on the
// invoice). Titled "Receipt" once paid, and marked cancelled if it was.
// A consigned (gallery/own-location) invoice has one line per work —
// sale price, commission and net — then the invoice's framing and
// delivery, deposits, the total, what's been paid and the balance. A direct sale's invoice
// of one shows its price, with VAT split out if the artist has a VAT
// number and rate.
export async function generateInvoicePdf(
  invoiceId: string
): Promise<{ bytes: Uint8Array; filename: string }> {
  const invoice = await loadInvoice(invoiceId);
  if (!invoice || invoice.lines.length === 0) throw new Error("Invoice not found.");

  const artist = invoice.artist;
  const sales = invoice.lines.map((l) => l.purchase);
  const first = sales[0];
  const isPaid = !!invoice.paidAt;
  const isCancelled = !!invoice.cancelledAt;
  const consigned = sales.every((s) => s.channel === "GALLERY");

  const rawLang = first.customer?.language || artist.invoiceLanguage;
  const lang = rawLang === "FR" ? "FR" : "EN";
  const t = LABELS[lang];
  const docTypeLabel = isPaid ? t.receipt : t.invoice;
  const dateLocale = lang === "FR" ? "fr-FR" : "en-GB";
  const number = formatInvoiceNumber(invoice.number);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const grey = rgb(0.45, 0.45, 0.45);
  const rule = rgb(0.85, 0.85, 0.85);
  const A4: [number, number] = [595.28, 841.89];
  let page: PDFPage = doc.addPage(A4);
  const { width, height } = page.getSize();
  const left = 50;
  const right = width - 50;
  let y = height - 60;

  const fmt = (n: number) => `${currencySymbol(invoice.currency)}${n.toFixed(2)}`;
  // Draws text ending at x (right-aligned).
  const textRightAt = (x: number, text: string, f: PDFFont = font, size = 10, color = rgb(0, 0, 0)) => {
    page.drawText(text, { x: x - f.widthOfTextAtSize(text, size), y, size, font: f, color });
  };
  // Starts a new page when fewer than `needed` points are left.
  const ensureSpace = (needed: number) => {
    if (y - needed >= 60) return;
    page = doc.addPage(A4);
    y = height - 60;
  };
  const drawRule = () => {
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: rule });
  };
  const drawRow = (label: string, value: string, isBold = false) => {
    ensureSpace(16);
    const f = isBold ? bold : font;
    page.drawText(label, { x: left, y, size: 10, font: f });
    textRightAt(right, value, f);
    y -= 16;
  };

  // ---- Logo (best-effort — still generates fine without one) ----
  const logo = await embedLogo(doc, artist.logoUrl);
  if (logo) {
    const logoHeight = 50;
    const scale = logoHeight / logo.height;
    page.drawImage(logo, { x: left, y: y - logoHeight + 12, width: logo.width * scale, height: logoHeight });
  }

  // ---- Document number + date, top right ----
  // No "#" (2026-08-13) — just the type label and the padded number,
  // e.g. "Receipt 0000005". An invoice is dated the day it was
  // produced; a receipt the day it was paid.
  textRightAt(right, `${docTypeLabel} ${number}`, bold, 16);
  y -= 18;
  const issued = isPaid ? invoice.paidAt! : invoice.createdAt;
  textRightAt(right, `${t.issueDate}: ${issued.toLocaleDateString(dateLocale)}`, font, 10, grey);

  y -= 60;

  // ---- From (the artist) ----
  page.drawText(artist.name, { x: left, y, size: 11, font: bold });
  y -= 14;
  for (const line of addressLines(artist)) {
    page.drawText(line, { x: left, y, size: 10, font });
    y -= 13;
  }
  if (artist.email) {
    page.drawText(artist.email, { x: left, y, size: 10, font });
    y -= 13;
  }
  if (artist.vatNumber) {
    page.drawText(`${t.vatNo}: ${artist.vatNumber}`, { x: left, y, size: 10, font });
    y -= 13;
  }

  y -= 20;

  // ---- Bill to (the buyer — the same on every sale of the invoice) ----
  page.drawText(t.billTo, { x: left, y, size: 9, font, color: grey });
  y -= 13;
  page.drawText(first.buyerName || first.buyerEmail || "—", { x: left, y, size: 11, font: bold });
  y -= 14;
  for (const line of (first.buyerAddress || "").split("\n").filter(Boolean)) {
    page.drawText(line, { x: left, y, size: 10, font });
    y -= 13;
  }
  if (first.buyerEmail) {
    page.drawText(first.buyerEmail, { x: left, y, size: 10, font });
    y -= 13;
  }

  y -= 30;

  let invoiceTotal = 0;
  let amountPaid = 0;

  if (consigned) {
    // ---- One line per work ----
    // Same figures the sale card and payment link use (lib/saleMath.ts).
    const amounts = sales.map((sale) => ({ sale, b: saleBreakdown(sale) }));
    const percents = [...new Set(amounts.map(({ b }) => b.commissionPercent))];
    const commissionHeading =
      percents.length === 1 && percents[0] ? `${t.commission} (${percents[0]}%)` : t.commission;
    const colSale = 360;
    const colCommission = 455;

    textRightAt(colSale, t.salePrice, font, 9, grey);
    textRightAt(colCommission, commissionHeading, font, 9, grey);
    textRightAt(right, t.net, font, 9, grey);
    page.drawText(t.work, { x: left, y, size: 9, font, color: grey });
    y -= 8;
    drawRule();
    y -= 18;

    for (const { sale, b } of amounts) {
      ensureSpace(20);
      // A work already paid on a gallery's unpaid invoice — paid work by
      // work (2026-10-20) — says so beside its name.
      const paidNote =
        !isPaid && sale.status === "COMPLETED" && sale.closedAt
          ? ` · ${t.paidOn} ${sale.closedAt.toLocaleDateString(dateLocale)}`
          : "";
      const title = fitText(
        `${saleTitle(sale.artwork.catalogueName, sale.chargeKind)}${paidNote}`,
        colSale - left - 80,
        font,
        10
      );
      page.drawText(title, { x: left, y, size: 10, font });
      textRightAt(colSale, fmt(b.salePrice));
      textRightAt(colCommission, b.commission ? `-${fmt(b.commission)}` : "—");
      textRightAt(right, fmt(b.salePrice - b.commission));
      y -= 20;
    }

    y += 4;
    drawRule();
    y -= 22;

    const sum = (pick: (b: (typeof amounts)[number]["b"]) => number) =>
      amounts.reduce((total, { b }) => total + pick(b), 0);
    // Framing and delivery: the invoice's own (2026-10-14), plus any an
    // older sale carries itself.
    const extras = invoiceExtras(invoice);
    const framing = sum((b) => b.framing) + extras.framing;
    const delivery = sum((b) => b.delivery) + extras.delivery;
    const deposit = sum((b) => b.deposit);
    invoiceTotal = sum((b) => b.net) + extras.framing + extras.delivery;
    amountPaid = sum((b) => b.paid) + extras.paid;

    if (framing) drawRow(t.framing, fmt(framing));
    if (delivery) drawRow(t.delivery, fmt(delivery));
    if (deposit) drawRow(t.deposit, `-${fmt(deposit)}`);
    if (framing || delivery || deposit) y -= 4;
    drawRow(t.invoiceTotal, fmt(invoiceTotal), true);
  } else {
    // ---- A direct sale: a record of what was (or will be) paid by card,
    // not a request for payment ----
    drawRule();
    y -= 22;
    const total = parseFloat(first.totalAmount.toString());
    const title = fitText(saleTitle(first.artwork.catalogueName, first.chargeKind), 360, bold, 11);
    page.drawText(title, { x: left, y, size: 11, font: bold });
    textRightAt(right, fmt(total), font, 11);
    y -= 25;
    drawRule();
    y -= 25;

    if (artist.vatNumber && artist.vatRate) {
      const vatRate = parseFloat(artist.vatRate.toString());
      const exVat = total / (1 + vatRate / 100);
      drawRow(t.salePriceExVat, fmt(exVat));
      drawRow(`${t.vat} (${vatRate}%)`, fmt(total - exVat));
      y -= 4;
    }
    drawRow(t.total, fmt(total), true);
    invoiceTotal = total;
    amountPaid = first.payments
      .filter((p) => p.status === "PAID")
      .reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);
  }

  y -= 6;
  drawRow(t.amountPaid, fmt(amountPaid));
  drawRow(t.balanceDue, fmt(Math.max(invoiceTotal - amountPaid, 0)), true);

  y -= 20;
  ensureSpace(40);

  // ---- Status note ----
  // No "UNPAID" (2026-08-13) — the balance due already says so.
  if (isCancelled) {
    const label = `${t.cancelled} ${invoice.cancelledAt!.toLocaleDateString(dateLocale)}`;
    page.drawText(label, { x: left, y, size: 10, font: bold, color: rgb(0.7, 0.15, 0.15) });
    y -= 16;
  } else if (isPaid) {
    const green = rgb(0.1, 0.5, 0.2);
    const paidLabel = `${t.paidOn} ${invoice.paidAt!.toLocaleDateString(dateLocale)}`;
    page.drawText(paidLabel, { x: left, y, size: 10, font: bold, color: green });
    y -= 16;
    page.drawText(t.receivedWithThanks, { x: left, y, size: 10, font: bold, color: green });
    y -= 14;
  } else if (!consigned) {
    page.drawText(t.paymentInProgress, { x: left, y, size: 10, font: bold, color: rgb(0.5, 0.4, 0.1) });
    y -= 16;
  }

  y -= 14;

  // ---- Footer (free text — VAT exemption notes, bank details, whatever
  // the artist wants; the artist's own words, so not translated) ----
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
  return { bytes, filename: `${isPaid ? "receipt" : "invoice"}-${number}.pdf` };
}
