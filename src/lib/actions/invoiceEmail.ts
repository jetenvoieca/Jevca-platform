"use server";

import { db } from "@/lib/db";
import { Resend } from "resend";
import { generateInvoicePdf } from "./invoice";

// Part Three (2026-09-01) — sending an invoice email for a gallery sale.
// Deliberately its own file, not folded into payments.ts or invoice.ts:
// this is the one place in the app that talks to Resend, and keeping it
// separate means the PDF-generation code (invoice.ts) and the
// sale-lifecycle code (payments.ts) don't need to know anything about
// email at all.

export type InvoiceEmailDraft = { to: string; subject: string; body: string };

function currencySymbol(currency: string) {
  return currency === "EUR" ? "€" : currency === "USD" ? "$" : "£";
}

async function loadPurchaseForEmail(purchaseId: string) {
  return db.purchase.findUnique({
    where: { id: purchaseId },
    include: { artwork: { include: { artist: true } }, customer: true },
  });
}

// The gallery's actual contact person gets it, not the general gallery
// inbox, if one's on file — same "sold to and invoiced through a named
// person there" idea as everywhere else a gallery's contact fields are
// used. Falls back to the gallery's general email if no contact email is
// set.
function recipientFor(customer: { contactEmail: string | null; email: string | null }) {
  return customer.contactEmail || customer.email;
}

// Builds the default subject/body for a gallery-sale invoice email, with
// placeholders already filled from real data — still fully editable
// before sending (InvoiceEmailModal). Mentions the Stripe payment link
// only if one has already been generated for this purchase's net-owed
// amount (createGalleryPaymentLink in payments.ts); a gallery invoice is
// just as often settled by bank transfer, so it's fine to send one
// without a link at all.
export async function getInvoiceEmailDraft(
  purchaseId: string
): Promise<InvoiceEmailDraft | { error: string }> {
  const purchase = await loadPurchaseForEmail(purchaseId);
  if (!purchase) return { error: "Sale not found." };
  if (purchase.channel !== "GALLERY") return { error: "This isn't a gallery sale." };
  if (!purchase.customer) return { error: "No gallery is linked to this sale." };

  const recipient = recipientFor(purchase.customer);
  if (!recipient) {
    return { error: "This gallery has no email address on file — add one on the Details tab first." };
  }

  const sym = currencySymbol(purchase.currency);
  const total = parseFloat(purchase.totalAmount.toString());
  const contactFirstName =
    purchase.customer.contactName?.trim().split(/\s+/)[0] || purchase.customer.name;

  const paymentLine = purchase.stripePaymentLinkUrl
    ? `Payment by transfer to our account on the invoice, or by this secure payment link: ${purchase.stripePaymentLinkUrl}`
    : "Payment by transfer to our account on the invoice.";

  const body = [
    `Dear ${contactFirstName},`,
    "",
    `It's great that you have sold ${purchase.artwork.presentationTitle} for ${sym}${total.toFixed(2)}.`,
    "",
    "I enclose our invoice for your attention.",
    "",
    paymentLine,
    "",
    "Many thanks,",
    purchase.artwork.artist.name,
  ].join("\n");

  return {
    to: recipient,
    subject: `Sale "${purchase.artwork.presentationTitle}"`,
    body,
  };
}

// Actually sends it, via Resend, with the real invoice PDF attached. The
// recipient is always re-derived from the Customer record here
// server-side — never taken from the submitted form — so an edited
// subject/body can never redirect where the email actually goes.
export async function sendInvoiceEmail(
  purchaseId: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const purchase = await loadPurchaseForEmail(purchaseId);
  if (!purchase) return { ok: false, error: "Sale not found." };
  if (!purchase.customer) return { ok: false, error: "No gallery is linked to this sale." };

  const recipient = recipientFor(purchase.customer);
  if (!recipient) {
    return { ok: false, error: "This gallery has no email address on file." };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    return {
      ok: false,
      error: "Email sending isn't configured yet — RESEND_API_KEY / RESEND_FROM_EMAIL are missing in Netlify.",
    };
  }

  const subject = ((formData.get("subject") as string) || "").trim();
  const body = ((formData.get("body") as string) || "").trim();
  if (!subject || !body) return { ok: false, error: "Subject and message can't be empty." };

  let attachment: { filename: string; bytes: Uint8Array };
  try {
    const { bytes, filename } = await generateInvoicePdf(purchaseId);
    attachment = { filename, bytes };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not generate the invoice." };
  }

  const resend = new Resend(apiKey);
  const artistName = purchase.artwork.artist.name;
  const artistEmail = purchase.artwork.artist.email;

  const { error } = await resend.emails.send({
    from: `${artistName} <${fromEmail}>`,
    to: recipient,
    replyTo: artistEmail || undefined,
    subject,
    text: body,
    attachments: [{ filename: attachment.filename, content: Buffer.from(attachment.bytes) }],
  });

  if (error) {
    return { ok: false, error: error.message || "Resend could not send the email." };
  }

  await db.purchase.update({
    where: { id: purchaseId },
    data: { invoiceEmailedAt: new Date(), invoiceEmailedTo: recipient },
  });

  return { ok: true };
}
