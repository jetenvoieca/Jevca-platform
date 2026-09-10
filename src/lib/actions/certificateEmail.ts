"use server";

import { db } from "@/lib/db";
import { Resend } from "resend";
import { generateCertificatePdf } from "./certificate";
import { artistFromAddress } from "@/lib/email";

// 2026-09-05, Email Integration: same change as invoiceEmail.ts — sends
// from the artist's own @jevca.art address instead of one shared
// RESEND_FROM_EMAIL, and no longer sets `replyTo` to the artist's
// personal email (replies now arrive at the @jevca.art address itself,
// via the Resend inbound webhook into /accounts/inbox). Also logs an
// OutboundEmail row (kind CERTIFICATE) for the Inbox's unified Sent
// list — see the matching note in invoiceEmail.ts.
//
// Available regardless of payment status (2026-09-10) — see the matching
// note in certificate.ts for why. Still refused for ABANDONED.

export type CertificateEmailDraft = { to: string; subject: string; body: string };

async function loadPurchaseForEmail(purchaseId: string) {
  return db.purchase.findUnique({
    where: { id: purchaseId },
    include: { artwork: { include: { artist: true } }, customer: true },
  });
}

function recipientFor(purchase: {
  customer: { contactEmail: string | null; email: string | null } | null;
  buyerEmail: string | null;
}) {
  if (purchase.customer) return purchase.customer.contactEmail || purchase.customer.email;
  return purchase.buyerEmail;
}

function firstNameFor(purchase: {
  customer: { contactName: string | null; name: string } | null;
  buyerName: string | null;
}) {
  if (purchase.customer) {
    return purchase.customer.contactName?.trim().split(/\s+/)[0] || purchase.customer.name;
  }
  return purchase.buyerName?.trim().split(/\s+/)[0] || "there";
}

export async function getCertificateEmailDraft(
  purchaseId: string
): Promise<CertificateEmailDraft | { error: string }> {
  const purchase = await loadPurchaseForEmail(purchaseId);
  if (!purchase) return { error: "Sale not found." };
  if (purchase.status === "ABANDONED") {
    return { error: "This sale was abandoned — a certificate can't be issued for a sale that didn't go ahead." };
  }

  const recipient = recipientFor(purchase);
  if (!recipient) {
    return { error: "No email address is on file for this sale — add one first." };
  }

  const contactFirstName = firstNameFor(purchase);

  const body = [
    `Dear ${contactFirstName},`,
    "",
    `Please find attached the Certificate of Authenticity for ${purchase.artwork.presentationTitle}.`,
    "",
    "Many thanks,",
    purchase.artwork.artist.name,
  ].join("\n");

  return {
    to: recipient,
    subject: `Certificate of Authenticity — "${purchase.artwork.presentationTitle}"`,
    body,
  };
}

export async function sendCertificateEmail(
  purchaseId: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const purchase = await loadPurchaseForEmail(purchaseId);
  if (!purchase) return { ok: false, error: "Sale not found." };
  if (purchase.status === "ABANDONED") {
    return { ok: false, error: "This sale was abandoned — a certificate can't be issued for a sale that didn't go ahead." };
  }

  const recipient = recipientFor(purchase);
  if (!recipient) {
    return { ok: false, error: "No email address is on file for this sale — add one first." };
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
    const { bytes, filename } = await generateCertificatePdf(purchaseId);
    attachment = { filename, bytes };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not generate the certificate." };
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

  await db.purchase.update({
    where: { id: purchaseId },
    data: { certificateEmailedAt: new Date(), certificateEmailedTo: recipient },
  });

  // Logged purely for the Inbox's unified Sent list (2026-09-05) — see
  // the matching note in invoiceEmail.ts.
  await db.outboundEmail.create({
    data: {
      resendEmailId: data?.id || null,
      fromAddress: fromResult.address,
      toAddress: recipient,
      subject,
      body,
      kind: "CERTIFICATE",
      purchaseId,
      artistId: purchase.artwork.artistId,
      customerId: purchase.customerId,
    },
  });

  return { ok: true };
}
