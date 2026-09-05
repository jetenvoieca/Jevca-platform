import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { processInboundEmail } from "@/lib/actions/inboundEmail";

// Resend "Inbound" webhook (2026-09-05, Email Integration) — every
// email sent to any @jevca.art address arrives here as an
// `email.received` event. Deliberately a thin adapter: this route only
// verifies the signature and hands the event data off to
// processInboundEmail (lib/actions/inboundEmail.ts), which does the
// actual matching/storing/alerting.
//
// Craig's manual step (see handover): create this webhook in the Resend
// dashboard pointing at https://<your-domain>/api/webhooks/resend-inbound
// for the `email.received` event, then paste the signing secret it gives
// you into Netlify as RESEND_WEBHOOK_SECRET.
export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) {
    console.warn("Resend inbound webhook fired but RESEND_API_KEY / RESEND_WEBHOOK_SECRET are missing.");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  // Must read the raw body with req.text(), not req.json() — Resend's
  // signature is computed over the exact raw bytes, and re-serialising a
  // parsed JSON object breaks verification (see Resend's own webhook
  // docs).
  const payload = await req.text();
  const resend = new Resend(apiKey);

  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: req.headers.get("svix-id") || "",
        timestamp: req.headers.get("svix-timestamp") || "",
        signature: req.headers.get("svix-signature") || "",
      },
      webhookSecret,
    });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "email.received") {
    await processInboundEmail({
      email_id: event.data.email_id,
      message_id: event.data.message_id,
      from: event.data.from,
      to: event.data.to,
      subject: event.data.subject,
    });
  }

  // Any other event type (delivered/bounced/complained/etc.) is simply
  // acknowledged and ignored — this endpoint only exists for Inbound
  // right now.
  return NextResponse.json({ ok: true });
}
