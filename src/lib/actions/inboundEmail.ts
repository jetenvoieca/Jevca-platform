"use server";

import { db } from "@/lib/db";
import { Resend } from "resend";
import { revalidatePath } from "next/cache";
import { raiseAlertIfNotAlreadyOpen, resolveAlertsOfType } from "@/lib/alerts";

// The unified admin inbox (2026-09-05, Email Integration) — processing
// of inbound webhook events, plus reading/replying to what lands here.
// See schema.prisma's InboundEmail/OutboundEmail model comments for the
// overall design ("one box with a filter", direct decision).

const EMAIL_REPLY_ALERT = "EMAIL_REPLY_RECEIVED";

function parseAddress(raw: string): { name: string | null; address: string } {
  const match = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].trim();
    return { name: name || null, address: match[2].trim().toLowerCase() };
  }
  return { name: null, address: raw.trim().toLowerCase() };
}

function localPart(address: string): string {
  return address.split("@")[0]?.toLowerCase() || "";
}

// Called by the webhook route (api/webhooks/resend-inbound/route.ts)
// once a Resend `email.received` event's signature has already been
// verified there — kept as its own server action, not inline in the
// route, so the route stays a thin adapter and this can be called/
// tested directly.
export async function processInboundEmail(eventData: {
  email_id: string;
  message_id?: string | null;
  from: string;
  to: string[];
  subject?: string | null;
}): Promise<void> {
  // Idempotent on Resend's own email_id — a redelivered webhook (Resend's
  // own retry behaviour) must never create a second row for the same
  // message.
  const existing = await db.inboundEmail.findUnique({
    where: { resendEmailId: eventData.email_id },
    select: { id: true },
  });
  if (existing) return;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("Resend inbound webhook fired but RESEND_API_KEY is missing — cannot fetch email body.");
    return;
  }
  const resend = new Resend(apiKey);

  // Webhooks only carry metadata — the actual HTML/Plain Text body has to
  // be fetched separately via the Receiving API.
  const { data: full, error } = await resend.emails.receiving.get(eventData.email_id);
  if (error || !full) {
    console.warn(`Could not fetch inbound email ${eventData.email_id} from Resend: ${error?.message}`);
    return;
  }

  const from = parseAddress(eventData.from);
  // Resend's `to` is one address per recipient — a message sent to more
  // than one @jevca.art address at once is rare enough (and not a
  // supported flow anywhere else in the app) that this just takes the
  // first one, same as every other place here assumes one artist per
  // address.
  const toRaw = eventData.to[0] || "";
  const to = parseAddress(toRaw);
  const slug = localPart(to.address);

  const artist = slug
    ? await db.artist.findUnique({ where: { emailSlug: slug }, select: { id: true } })
    : null;

  // Best-effort Customer match — only within this same artist, and only
  // if we actually resolved one (see the model-level note on
  // InboundEmail in schema.prisma).
  const customer = artist
    ? await db.customer.findFirst({
        where: {
          artistId: artist.id,
          OR: [{ email: from.address }, { contactEmail: from.address }],
        },
        select: { id: true },
      })
    : null;

  await db.inboundEmail.create({
    data: {
      resendEmailId: eventData.email_id,
      messageId: eventData.message_id || (full.headers as Record<string, string> | undefined)?.["message-id"] || null,
      fromAddress: from.address,
      fromName: from.name,
      toAddress: to.address,
      artistId: artist?.id || null,
      customerId: customer?.id || null,
      subject: eventData.subject || full.subject || null,
      textBody: full.text || null,
      htmlBody: full.html || null,
    },
  });

  if (artist) {
    await raiseAlertIfNotAlreadyOpen({
      artistId: artist.id,
      type: EMAIL_REPLY_ALERT,
      severity: "WARNING",
      message: `New email reply for ${slug}@jevca.art — check the inbox.`,
    });
  }

  revalidatePath("/accounts/inbox");
  revalidatePath("/alerts");
}

export type InboxThreadItem = {
  id: string;
  direction: "IN" | "OUT";
  fromAddress: string;
  fromName: string | null;
  toAddress: string;
  subject: string | null;
  textBody: string | null;
  isRead: boolean;
  at: string; // ISO
};

export type InboxSummaryItem = {
  id: string;
  fromAddress: string;
  fromName: string | null;
  toAddress: string;
  subject: string | null;
  preview: string;
  artistId: string | null;
  artistName: string | null;
  customerId: string | null;
  customerName: string | null;
  isRead: boolean;
  receivedAt: string;
};

// The inbox list — every InboundEmail across the whole platform, newest
// first, optionally filtered to one artist ("one box with a filter",
// 2026-09-05 decision). OutboundEmail rows only ever show up inside an
// opened thread (getThread below), not in this list — keeps the main
// list to "things you might need to act on", not a mix of
// sent-and-received. See getSentList below for the separate Sent view.
export async function getInboxList(artistId?: string): Promise<InboxSummaryItem[]> {
  const rows = await db.inboundEmail.findMany({
    where: artistId ? { artistId } : undefined,
    orderBy: { receivedAt: "desc" },
    take: 200,
    include: {
      artist: { select: { name: true } },
      customer: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    fromAddress: r.fromAddress,
    fromName: r.fromName,
    toAddress: r.toAddress,
    subject: r.subject,
    preview: (r.textBody || "").slice(0, 140),
    artistId: r.artistId,
    artistName: r.artist?.name || null,
    customerId: r.customerId,
    customerName: r.customer?.name || null,
    isRead: r.isRead,
    receivedAt: r.receivedAt.toISOString(),
  }));
}

// Every artist with a sending address set — the filter dropdown's
// options, shared by both the Inbox and Sent views. An artist with no
// emailSlug yet can't have received or sent anything, so it's correctly
// left out.
export async function getArtistFilterOptions(): Promise<{ id: string; name: string }[]> {
  return db.artist.findMany({
    where: { emailSlug: { not: null }, status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export type SentSummaryItem = {
  id: string;
  kind: string; // "ADMIN" | "REPLY" | "INVOICE" | "RECEIPT" | "CERTIFICATE"
  fromAddress: string;
  toAddress: string;
  subject: string | null;
  preview: string;
  artistId: string | null;
  artistName: string | null;
  customerId: string | null;
  customerName: string | null;
  artworkTitle: string | null;
  sentAt: string;
};

// The unified Sent view (2026-09-05, second Email Integration request) —
// every OutboundEmail regardless of kind: ad hoc Compose sends, inbox
// replies, and now invoice/receipt/certificate sends too (see the note
// on OutboundEmail in schema.prisma). Optionally filtered to one artist,
// same as getInboxList above.
export async function getSentList(artistId?: string): Promise<SentSummaryItem[]> {
  const rows = await db.outboundEmail.findMany({
    where: artistId ? { artistId } : undefined,
    orderBy: { sentAt: "desc" },
    take: 200,
    include: {
      artist: { select: { name: true } },
      customer: { select: { name: true } },
      purchase: { select: { artwork: { select: { presentationTitle: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    fromAddress: r.fromAddress,
    toAddress: r.toAddress,
    subject: r.subject,
    preview: (r.body || "").slice(0, 140),
    artistId: r.artistId,
    artistName: r.artist?.name || null,
    customerId: r.customerId,
    customerName: r.customer?.name || null,
    artworkTitle: r.purchase?.artwork.presentationTitle || null,
    sentAt: r.sentAt.toISOString(),
  }));
}

// A thread = the opened inbound email, plus every OutboundEmail sent as
// a reply to it, in order — deliberately not a wider "everything ever
// exchanged with this address" view, since a gallery contact can
// reasonably start more than one distinct conversation over time.
// Marks the inbound email read and clears any open EMAIL_REPLY_RECEIVED
// alert for its artist the first time it's opened.
export async function getThread(inboundEmailId: string): Promise<InboxThreadItem[] | null> {
  const inbound = await db.inboundEmail.findUnique({ where: { id: inboundEmailId } });
  if (!inbound) return null;

  if (!inbound.isRead) {
    await db.inboundEmail.update({ where: { id: inboundEmailId }, data: { isRead: true } });
    if (inbound.artistId) {
      await resolveAlertsOfType(inbound.artistId, EMAIL_REPLY_ALERT);
    }
    revalidatePath("/alerts");
  }

  const replies = await db.outboundEmail.findMany({
    where: { inReplyToId: inboundEmailId },
    orderBy: { sentAt: "asc" },
  });

  const items: InboxThreadItem[] = [
    {
      id: inbound.id,
      direction: "IN",
      fromAddress: inbound.fromAddress,
      fromName: inbound.fromName,
      toAddress: inbound.toAddress,
      subject: inbound.subject,
      textBody: inbound.textBody,
      isRead: true,
      at: inbound.receivedAt.toISOString(),
    },
    ...replies.map((r) => ({
      id: r.id,
      direction: "OUT" as const,
      fromAddress: r.fromAddress,
      fromName: null,
      toAddress: r.toAddress,
      subject: r.subject,
      textBody: r.body,
      isRead: true,
      at: r.sentAt.toISOString(),
    })),
  ];

  return items;
}

// Replying from an open thread — always from the same address the
// original was sent to (the artist's own address, or the general admin
// one), so the recipient sees the reply come from the same place they
// wrote to.
export async function sendInboxReply(
  inboundEmailId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const inbound = await db.inboundEmail.findUnique({
    where: { id: inboundEmailId },
    include: { artist: { select: { name: true } } },
  });
  if (!inbound) return { ok: false, error: "Message not found." };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Email sending isn't configured — RESEND_API_KEY is missing in Netlify." };
  }

  const body = ((formData.get("body") as string) || "").trim();
  if (!body) return { ok: false, error: "Message can't be empty." };
  const subject =
    inbound.subject && inbound.subject.trim().toLowerCase().startsWith("re:")
      ? inbound.subject
      : `Re: ${inbound.subject || "(no subject)"}`;

  const fromDisplay = inbound.artist ? `${inbound.artist.name} <${inbound.toAddress}>` : inbound.toAddress;

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: fromDisplay,
    to: inbound.fromAddress,
    subject,
    text: body,
    headers: inbound.messageId
      ? { "In-Reply-To": inbound.messageId, References: inbound.messageId }
      : undefined,
  });

  if (error) return { ok: false, error: error.message || "Resend could not send the reply." };

  await db.outboundEmail.create({
    data: {
      resendEmailId: data?.id || null,
      fromAddress: inbound.toAddress,
      toAddress: inbound.fromAddress,
      subject,
      body,
      kind: "REPLY",
      artistId: inbound.artistId,
      customerId: inbound.customerId,
      inReplyToId: inbound.id,
    },
  });

  revalidatePath("/accounts/inbox");
  return { ok: true };
}
