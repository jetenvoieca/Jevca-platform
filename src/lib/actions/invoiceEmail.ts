"use server";

import { db } from "@/lib/db";
import { Resend } from "resend";
import { generateInvoicePdf } from "./invoice";
import { artistFromAddress } from "@/lib/email";
import { saleTitle } from "@/lib/saleMath";
import { invoiceParty, loadInvoice, type LoadedInvoice } from "@/lib/invoices";
import { formatInvoiceNumber } from "@/lib/invoiceNumber";
import { ensureInvoicePaymentLink } from "./invoices";

// Emailing an invoice, or its receipt once paid (Part Three, 2026-09-01;
// by invoice since 2026-10-14, so one email covers every sale on it).
// Sent through Resend from the artist's own @jevca.art address
// (artistFromAddress, lib/email.ts), so a gallery's reply arrives in the
// shared admin Inbox. Also logged as an OutboundEmail (kind INVOICE or
// RECEIPT) for the Inbox's Sent list.
//
// Who it goes to (invoiceParty, lib/invoices.ts): a real Gallery-type
// Location's contact; otherwise the buyer recorded on the sale.

export type InvoiceEmailDraft = { to: string; subject: string; body: string };

function currencySymbol(currency: string) {
  return currency === "EUR" ? "€" : currency === "USD" ? "$" : "£";
}

// Where an invoice's email goes, or why it can't be sent.
function recipientFor(invoice: LoadedInvoice): { ok: true; to: string } | { ok: false; error: string } {
  if (invoice.cancelledAt) return { ok: false, error: "This invoice was cancelled." };
  const first = invoice.lines[0]?.purchase;
  if (!first) return { ok: false, error: "Invoice not found." };
  const party = invoiceParty(first);
  if (!party.email) {
    return {
      ok: false,
      error: party.isGallery
        ? "This location has no email address on file — add one on the Details tab first."
        : "This sale has no buyer email on file.",
    };
  }
  return { ok: true, to: party.email };
}

// The default subject and message, filled from the invoice — still fully
// editable before sending (InvoiceModal). An unpaid invoice asks
// for payment (mentioning its payment link if it has one, since it's as
// often settled by bank transfer); a paid one thanks them and encloses
// the receipt, with no payment request at all. A gallery is
// congratulated on its sale(s); anyone else thanked for their purchase.
export async function getInvoiceEmailDraft(invoiceId: string): Promise<InvoiceEmailDraft | { error: string }> {
  // An unpaid invoice's payment link is made when it's produced; if that
  // didn't work then (or it was retired since — a work paid by itself, an
  // artwork renamed), it's made now so the email can include it. A
  // failure just leaves the email without it.
  await ensureInvoicePaymentLink(invoiceId);
  const invoice = await loadInvoice(invoiceId);
  if (!invoice) return { error: "Invoice not found." };
  const recipient = recipientFor(invoice);
  if (!recipient.ok) return { error: recipient.error };

  const sales = invoice.lines.map((l) => l.purchase);
  const first = sales[0];
  const party = invoiceParty(first);
  const sym = currencySymbol(invoice.currency);
  const price = (sale: (typeof sales)[number]) =>
    `${sym}${parseFloat(sale.totalAmount.toString()).toFixed(2)}`;
  const isPaid = !!invoice.paidAt;

  let opening: string[];
  if (sales.length > 1) {
    opening = [
      party.isGallery ? "It's great that you have sold these works:" : "Thank you for your purchase of these works:",
      ...sales.map((s) => `- ${saleTitle(s.artwork.catalogueName, s.chargeKind)}: ${price(s)}`),
    ];
  } else if (first.chargeKind) {
    // A framing/delivery charge sale (2026-09-23) is about the charge,
    // not a sale of the artwork itself.
    const charge = first.chargeKind === "FRAMING" ? "framing" : "delivery";
    opening = [`This is for the ${charge} of ${first.artwork.catalogueName}: ${price(first)}.`];
  } else {
    opening = [
      party.isGallery
        ? `It's great that you have sold ${first.artwork.catalogueName} for ${price(first)}.`
        : `Thank you for your purchase of ${first.artwork.catalogueName} for ${price(first)}.`,
    ];
  }

  const middle = isPaid
    ? ["Thank you for the payment — I enclose our receipt for your records."]
    : [
        "I enclose our invoice for your attention.",
        "",
        invoice.stripePaymentLinkUrl
          ? `Payment by transfer to our account on the invoice, or by this secure payment link: ${invoice.stripePaymentLinkUrl}`
          : "Payment by transfer to our account on the invoice.",
      ];

  const body = [
    `Dear ${party.firstName || "there"},`,
    "",
    ...opening,
    "",
    ...middle,
    "",
    "Many thanks,",
    invoice.artist.name,
  ].join("\n");

  const subject =
    sales.length > 1
      ? `${isPaid ? "Receipt" : "Invoice"} ${formatInvoiceNumber(invoice.number)}`
      : `Sale "${saleTitle(first.artwork.catalogueName, first.chargeKind)}"`;

  return { to: recipient.to, subject, body };
}

// Sends it, with the invoice (or receipt) PDF attached. The recipient is
// always worked out again here — never taken from the form — so an
// edited subject or message can never redirect where it goes.
export async function sendInvoiceEmail(
  invoiceId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const invoice = await loadInvoice(invoiceId);
  if (!invoice) return { ok: false, error: "Invoice not found." };
  const recipient = recipientFor(invoice);
  if (!recipient.ok) return recipient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Email sending isn't configured yet — RESEND_API_KEY is missing in Netlify." };
  }

  const fromResult = artistFromAddress(invoice.artist);
  if (!fromResult.ok) return { ok: false, error: fromResult.error };

  const subject = ((formData.get("subject") as string) || "").trim();
  const body = ((formData.get("body") as string) || "").trim();
  if (!subject || !body) return { ok: false, error: "Subject and message can't be empty." };

  let attachment: { filename: string; bytes: Uint8Array };
  try {
    attachment = await generateInvoicePdf(invoiceId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not generate the invoice." };
  }

  const { data, error } = await new Resend(apiKey).emails.send({
    from: fromResult.from,
    to: recipient.to,
    subject,
    text: body,
    attachments: [{ filename: attachment.filename, content: Buffer.from(attachment.bytes) }],
  });
  if (error) return { ok: false, error: error.message || "Resend could not send the email." };

  const isPaid = !!invoice.paidAt;
  const now = new Date();
  await db.invoice.update({
    where: { id: invoice.id },
    data: isPaid
      ? { receiptEmailedAt: now, receiptEmailedTo: recipient.to }
      : { emailedAt: now, emailedTo: recipient.to },
  });

  await db.outboundEmail.create({
    data: {
      resendEmailId: data?.id || null,
      fromAddress: fromResult.address,
      toAddress: recipient.to,
      subject,
      body,
      kind: isPaid ? "RECEIPT" : "INVOICE",
      invoiceId: invoice.id,
      artistId: invoice.artistId,
      customerId: invoice.lines[0].purchase.customerId,
    },
  });

  return { ok: true };
}
