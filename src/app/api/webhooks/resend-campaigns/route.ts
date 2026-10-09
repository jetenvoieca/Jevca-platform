import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { recordCampaignEvent } from "@/lib/campaignTracking";

// Resend webhook for campaign mails (2026-10-09, Marketing step 4a):
// delivered, opened, clicked, bounced, suppressed, complained and failed
// events, recorded by lib/campaignTracking.ts. Events for any other mail
// (invoices, receipts…) have no campaign tag and are ignored.
//
// Craig's manual step (see handover): in Resend → Webhooks, add an
// endpoint https://jevca.netlify.app/api/webhooks/resend-campaigns for
// those seven events, then paste its signing secret into Netlify as
// RESEND_CAMPAIGN_WEBHOOK_SECRET.
const EVENTS = new Set([
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.suppressed",
  "email.complained",
  "email.failed",
]);

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_CAMPAIGN_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) {
    console.warn("Resend campaign webhook fired but RESEND_API_KEY / RESEND_CAMPAIGN_WEBHOOK_SECRET are missing.");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  // The signature is over the exact raw body, so it's read as text.
  const payload = await req.text();
  let event;
  try {
    event = new Resend(apiKey).webhooks.verify({
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

  if (!EVENTS.has(event.type) || !("email_id" in event.data)) {
    return NextResponse.json({ ok: true });
  }

  const data = event.data;
  // (An error here answers 500, so Resend sends the event again later.)
  await recordCampaignEvent({
    type: event.type,
    createdAt: event.created_at,
    emailId: data.email_id,
    to: "to" in data && Array.isArray(data.to) ? data.to : [],
    tags: "tags" in data && data.tags ? data.tags : {},
    clickedAt: event.type === "email.clicked" ? event.data.click.timestamp : undefined,
    bounce: event.type === "email.bounced" ? { type: event.data.bounce.type, message: event.data.bounce.message } : undefined,
    reason:
      event.type === "email.failed"
        ? event.data.failed.reason
        : event.type === "email.suppressed"
          ? event.data.suppressed.message
          : undefined,
  });

  return NextResponse.json({ ok: true });
}
