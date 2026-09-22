"use server";

import { db } from "@/lib/db";
import { Resend } from "resend";
import { generateInvoicePdf } from "./invoice";
import { artistFromAddress } from "@/lib/email";
import { saleTitle } from "@/lib/saleMath";

// Part Three (2026-09-01) — sending an invoice email for a gallery sale.
// Deliberately its own file, not folded into payments.ts or invoice.ts:
// this is the one place in the app that talks to Resend, and keeping it
// separate means the PDF-generation code (invoice.ts) and the
// sale-lifecycle code (payments.ts) don't need to know anything about
// email at all.
//
// 2026-09-05, Email Integration: sends from the artist's own
// louise.dear@jevca.art address (artistFromAddress in lib/email.ts)
// instead of one shared RESEND_FROM_EMAIL address. `replyTo` pointing at
// the artist's personal email has been removed — a gallery's reply now
// arrives at that same @jevca.art address and is picked up by the
// Resend inbound webhook into the shared admin inbox
// (/accounts/inbox).
//
// 2026-09-05, same day, second request — also logs an OutboundEmail row
// (kind INVOICE/RECEIPT, linked to this purchase) purely so the send
// shows up in the Inbox's unified Sent list. Purchase's own
// invoiceEmailedAt/invoiceEmailedTo fields are untouched and still what
// the sale card itself reads.
//
// 2026-09-21: also used for an ordinary (direct, non-gallery) sale, to
// its buyer — see recipientForPurchase below for who each kind goes to.
//
// 2026-09-22, Location rework: "gallery wording/gallery contact" below
// now means specifically a GALLERY-type Location (Customer.kind ===
// "GALLERY") — NOT simply `purchase.channel === "GALLERY"`, which is
// also true for an Own-type Location's sale (see the note on
// startGallerySale in payments.ts: `channel` only ever distinguishes
// "not taken through Stripe", never "at a real third-party gallery").
// Getting this wrong would have sent every Own-location invoice to that
// Location's own auto-created Customer record, which typically has no
// email on file at all — the real buyer's own email/name, captured on
// the Record Sale form and snapshotted onto Purchase.buyerEmail/
// buyerName, is what an Own-location sale should actually use.

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

type PurchaseForEmail = NonNullable<Awaited<ReturnType<typeof loadPurchaseForEmail>>>;

// True only for a real, third-party Gallery Location — see the
// file-level note above. An Own-location sale (customer.kind "OWN") and
// an ordinary direct sale (no linked customer, or an "INDIVIDUAL" one)
// both fall through to the buyer-email path below.
function isGalleryLocationSale(purchase: PurchaseForEmail): boolean {
  return purchase.customer?.kind === "GALLERY";
}

// The gallery's actual contact person gets it, not the general gallery
// inbox, if one's on file — same "sold to and invoiced through a named
// person there" idea as everywhere else a gallery's contact fields are
// used. Falls back to the gallery's general email if no contact email is
// set.
function recipientFor(customer: { contactEmail: string | null; email: string | null }) {
  return customer.contactEmail || customer.email;
}

// Who the email goes to: a real Gallery-location sale to the gallery's
// contact (see above); everything else (an Own-location sale, or an
// ordinary direct sale) to the buyer's own email address recorded on
// the sale.
function recipientForPurchase(purchase: PurchaseForEmail) {
  if (isGalleryLocationSale(purchase)) {
    return purchase.customer ? recipientFor(purchase.customer) : null;
  }
  return purchase.buyerEmail;
}

// Builds the default subject/body for a sale email, with placeholders
// already filled from real data — still fully editable before sending
// (InvoiceEmailModal). Wording branches on whether the sale is already
// paid (2026-09-03 fix): an unpaid sale gets asked for payment (mentioning
// the Stripe link only if one's been generated — createGalleryPaymentLink
// in payments.ts — since an invoice is just as often settled by bank
// transfer); a paid sale gets thanked and sent its receipt, with no
// payment request at all — the earlier wording asked a gallery that had
// *already paid* to pay again, which read as a genuine mistake, not just a
// labelling quirk. A real Gallery-location sale is congratulated on its
// sale; an Own-location or ordinary direct sale thanks the buyer for
// their purchase.
export async function getInvoiceEmailDraft(
  purchaseId: string
): Promise<InvoiceEmailDraft | { error: string }> {
  const purchase = await loadPurchaseForEmail(purchaseId);
  if (!purchase) return { error: "Sale not found." };

  const isGallery = isGalleryLocationSale(purchase);
  if (isGallery && !purchase.customer) return { error: "No gallery is linked to this sale." };

  const recipient = recipientForPurchase(purchase);
  if (!recipient) {
    return {
      error: isGallery
        ? "This gallery has no email address on file — add one on the Details tab first."
        : "This sale has no buyer email on file.",
    };
  }

  const sym = currencySymbol(purchase.currency);
  const total = parseFloat(purchase.totalAmount.toString());
  const firstName =
    (isGallery
      ? purchase.customer?.contactName?.trim().split(/\s+/)[0] || purchase.customer?.name
      : purchase.buyerName?.trim().split(/\s+/)[0]) || "there";
  const isPaid = purchase.status === "COMPLETED";

  // A framing/delivery charge sale (2026-09-23) is about the charge,
  // not a sale of the artwork itself.
  const chargeLabel =
    purchase.chargeKind === "FRAMING" ? "framing" : purchase.chargeKind === "DELIVERY" ? "delivery" : null;
  const opening = chargeLabel
    ? `This is for the ${chargeLabel} of ${purchase.artwork.presentationTitle}: ${sym}${total.toFixed(2)}.`
    : isGallery
      ? `It's great that you have sold ${purchase.artwork.presentationTitle} for ${sym}${total.toFixed(2)}.`
      : `Thank you for your purchase of ${purchase.artwork.presentationTitle} for ${sym}${total.toFixed(2)}.`;

  const middleParagraphs = isPaid
    ? ["Thank you for the payment — I enclose our receipt for your records."]
    : [
        "I enclose our invoice for your attention.",
        "",
        purchase.stripePaymentLinkUrl
          ? `Payment by transfer to our account on the invoice, or by this secure payment link: ${purchase.stripePaymentLinkUrl}`
          : "Payment by transfer to our account on the invoice.",
      ];

  const body = [
    `Dear ${firstName},`,
    "",
    opening,
    "",
    ...middleParagraphs,
    "",
    "Many thanks,",
    purchase.artwork.artist.name,
  ].join("\n");

  return {
    to: recipient,
    subject: `Sale "${saleTitle(purchase.artwork.presentationTitle, purchase.chargeKind)}"`,
    body,
  };
}

// Actually sends it, via Resend, with the real invoice/receipt PDF
// attached (generateInvoicePdf itself already picks the right document —
// "Invoice" or "Receipt" — based on the sale's paid status). The
// recipient is always re-derived from the sale server-side — never taken
// from the submitted form — so an edited subject/body can never redirect
// where the email actually goes.
export async function sendInvoiceEmail(
  purchaseId: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const purchase = await loadPurchaseForEmail(purchaseId);
  if (!purchase) return { ok: false, error: "Sale not found." };

  const isGallery = isGalleryLocationSale(purchase);
  if (isGallery && !purchase.customer) {
    return { ok: false, error: "No gallery is linked to this sale." };
  }

  const recipient = recipientForPurchase(purchase);
  if (!recipient) {
    return {
      ok: false,
      error: isGallery
        ? "This gallery has no email address on file."
        : "This sale has no buyer email on file.",
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "Email sending isn't configured yet — RESEND_API_KEY is missing in Netlify.",
    };
  }

  const fromResult = artistFromAddress(purchase.artwork.artist);
  if (!fromResult.ok) return { ok: false, error: fromResult.error };

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

  const { data, error } = await resend.emails.send({
    from: fromResult.from,
    to: recipient,
    subject,
    text: body,
    attachments: [{ filename: attachment.filename, content: Buffer.from(attachment.bytes) }],
  });

  if (error) {
    return { ok: false, error: error.message || "Resend could not send the email." };
  }

  const isPaid = purchase.status === "COMPLETED";

  await db.purchase.update({
    where: { id: purchaseId },
    // Invoice and receipt each keep their own sent-log (2026-09-23), so
    // sending the receipt no longer overwrites when the invoice went.
    data: isPaid
      ? { receiptEmailedAt: new Date(), receiptEmailedTo: recipient }
      : { invoiceEmailedAt: new Date(), invoiceEmailedTo: recipient },
  });

  // Logged purely for the Inbox's unified Sent list (2026-09-05) —
  // doesn't replace the invoiceEmailedAt/invoiceEmailedTo update above,
  // which is still what the sale card itself displays.
  await db.outboundEmail.create({
    data: {
      resendEmailId: data?.id || null,
      fromAddress: fromResult.address,
      toAddress: recipient,
      subject,
      body,
      kind: isPaid ? "RECEIPT" : "INVOICE",
      purchaseId,
      artistId: purchase.artwork.artistId,
      customerId: purchase.customerId,
    },
  });

  return { ok: true };
}
