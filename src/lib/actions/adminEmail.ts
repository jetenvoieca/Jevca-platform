"use server";

import { db } from "@/lib/db";
import { clientWords } from "@/lib/clientKind";
import { Resend } from "resend";
import { revalidatePath } from "next/cache";
import type { Mailbox } from "@/lib/email";
import { recordSentMessageId } from "@/lib/emailThreading";
import { readableEmailText } from "@/lib/emailText";
import { formatDateTime } from "@/lib/formatDate";
import { getFromR2 } from "@/lib/r2";

// Ad hoc admin emails (2026-09-05, Email Integration) — the Inbox's
// "New message" compose flow. Never sent on an artist's behalf,
// regardless of who the recipient is — direct decision: "craig@jevca.art
// is more friendly". Which shared address it comes from depends on the
// mailbox it's written in (2026-09-27): Art sends from
// PlatformSettings.adminEmailAddress (craig@jevca.art), Business from
// PlatformSettings.businessEmailAddress (craig@jetenvoieca.com).
//
// The same send is used from a task (2026-09-27): with a taskId, the email
// is recorded against the task (kind "TASK") and its Message-ID is kept,
// so a reply can be linked back to the task — see lib/emailThreading.ts.
//
// forwardEmail (2026-09-28) forwards a received or sent email from the
// same shared address — see the note on it below.

const SINGLETON_ID = "singleton";

const SENDER_NAMES: Record<Mailbox, string> = {
  ART: "Craig, Jevca",
  BUSINESS: "Craig, Jetenvoieca",
};

export type ComposeRecipient = {
  label: string;
  email: string;
  artistId: string | null;
  customerId: string | null;
};

// Recipient list for the Compose screen — every artist with an email on
// file, plus every customer (gallery/individual) across every artist,
// labelled so the same email address showing up for two artists (a
// shared gallery contact) is never ambiguous about which one this is.
export async function getComposeRecipients(): Promise<ComposeRecipient[]> {
  const [artists, customers] = await Promise.all([
    db.artist.findMany({
      where: { email: { not: null }, status: { not: "ARCHIVED" } },
      select: { id: true, name: true, kind: true, email: true },
      orderBy: { name: "asc" },
    }),
    db.customer.findMany({
      where: { OR: [{ email: { not: null } }, { contactEmail: { not: null } }] },
      select: {
        id: true,
        name: true,
        contactName: true,
        email: true,
        contactEmail: true,
        artistId: true,
        artist: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const artistRecipients: ComposeRecipient[] = artists
    .filter((a): a is typeof a & { email: string } => !!a.email)
    .map((a) => ({ label: `${a.name} (${clientWords(a.kind).client.toLowerCase()})`, email: a.email, artistId: a.id, customerId: null }));

  // flatMap rather than map+filter(Boolean) (2026-09-05 build fix) —
  // returning [] to skip a customer with no email keeps every element
  // of the resulting array a real ComposeRecipient object directly, so
  // there's no intermediate `| null` union for TypeScript to narrow
  // away, which is what broke the production build here.
  const customerRecipients: ComposeRecipient[] = customers.flatMap((c) => {
    const email = c.contactEmail || c.email;
    if (!email) return [];
    const who = c.contactName ? `${c.contactName}, ${c.name}` : c.name;
    return [{ label: `${who} — ${c.artist.name}`, email, artistId: c.artistId, customerId: c.id }];
  });

  return [...artistRecipients, ...customerRecipients];
}

// The address each mailbox's new messages are sent from.
export async function getMailboxAddresses(): Promise<Record<Mailbox, string>> {
  const settings = await db.platformSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
  return { ART: settings.adminEmailAddress, BUSINESS: settings.businessEmailAddress };
}

export async function updateAdminEmailAddress(value: string): Promise<void> {
  const address = value.trim();
  if (!address) return;
  await db.platformSettings.upsert({
    where: { id: SINGLETON_ID },
    update: { adminEmailAddress: address },
    create: { id: SINGLETON_ID, adminEmailAddress: address },
  });
  revalidatePath("/accounts/inbox");
}

// Sends an ad hoc email from the mailbox's own address (see the
// file-level note above), regardless of who the recipient is. Still tags
// artistId/customerId if the recipient was picked from the list (rather
// than typed freehand), purely so it shows up filtered correctly in the
// inbox. Sent from a task, it takes the task's artist if none was picked.
export async function sendAdminEmail(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const to = ((formData.get("to") as string) || "").trim();
  const subject = ((formData.get("subject") as string) || "").trim();
  const body = ((formData.get("body") as string) || "").trim();
  const artistId = (formData.get("artistId") as string) || null;
  const customerId = (formData.get("customerId") as string) || null;
  const mailbox: Mailbox = formData.get("mailbox") === "BUSINESS" ? "BUSINESS" : "ART";
  const taskId = (formData.get("taskId") as string) || null;

  if (!to || !subject || !body) {
    return { ok: false, error: "To, subject and message are all required." };
  }

  const task = taskId
    ? await db.task.findUnique({ where: { id: taskId }, select: { id: true, artistId: true } })
    : null;
  if (taskId && !task) return { ok: false, error: "Task not found — it may have been deleted." };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Email sending isn't configured — RESEND_API_KEY is missing in Netlify." };
  }

  const fromAddress = (await getMailboxAddresses())[mailbox];
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: `${SENDER_NAMES[mailbox]} <${fromAddress}>`,
    to,
    subject,
    text: body,
  });
  if (error) return { ok: false, error: error.message || "Resend could not send the email." };

  const sent = await db.outboundEmail.create({
    data: {
      resendEmailId: data?.id || null,
      fromAddress,
      toAddress: to,
      subject,
      body,
      kind: task ? "TASK" : "ADMIN",
      mailbox,
      artistId: artistId || task?.artistId || null,
      customerId: customerId || null,
      taskId: task?.id ?? null,
    },
    select: { id: true },
  });
  if (task && data?.id) await recordSentMessageId(resend, sent.id, data.id);

  revalidatePath("/accounts/inbox");
  return { ok: true };
}

// Which email to forward: a received one (InboundEmail) or a sent one
// (OutboundEmail).
export type ForwardSource = { kind: "IN" | "OUT"; id: string };

type ForwardOriginal = {
  mailbox: Mailbox;
  from: string;
  to: string;
  at: Date;
  subject: string | null;
  text: string;
  html: string | null;
  attachments: { filename: string; r2Key: string }[];
  artistId: string | null;
  customerId: string | null;
  taskId: string | null;
};

async function loadForwardOriginal(source: ForwardSource): Promise<ForwardOriginal | null> {
  if (source.kind === "IN") {
    const r = await db.inboundEmail.findUnique({
      where: { id: source.id },
      include: { attachments: { orderBy: { createdAt: "asc" } } },
    });
    if (!r) return null;
    return {
      mailbox: r.mailbox,
      from: r.fromName ? `${r.fromName} <${r.fromAddress}>` : r.fromAddress,
      to: r.toAddress,
      at: r.receivedAt,
      subject: r.subject,
      text: readableEmailText(r.textBody, r.htmlBody),
      html: r.htmlBody,
      attachments: r.attachments.flatMap((a) => (a.r2Key ? [{ filename: a.filename, r2Key: a.r2Key }] : [])),
      artistId: r.artistId,
      customerId: r.customerId,
      taskId: r.taskId,
    };
  }
  const r = await db.outboundEmail.findUnique({ where: { id: source.id } });
  if (!r) return null;
  return {
    mailbox: r.mailbox,
    from: r.fromAddress,
    to: r.toAddress,
    at: r.sentAt,
    subject: r.subject,
    text: r.body || "",
    html: null,
    attachments: [],
    artistId: r.artistId,
    customerId: r.customerId,
    taskId: r.taskId,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Forwards a received or sent email (2026-09-28, direct request) to any
// address, from the shared address of the mailbox it belongs to
// (craig@jevca.art or craig@jetenvoieca.com — never an artist's own
// address), with an optional note above the usual "Forwarded message"
// block. A received email keeps its original formatting and the
// attachments that were stored with it; a sent email has neither — its
// text is all that's kept (an invoice/receipt/certificate PDF is made
// when it's sent, not stored). Recorded in the Sent list as kind
// "FORWARD"; a forward of a task's email stays linked to that task.
export async function forwardEmail(
  source: ForwardSource,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const to = ((formData.get("to") as string) || "").trim();
  const note = ((formData.get("note") as string) || "").trim();
  if (!to) return { ok: false, error: "Enter who to forward it to." };

  const original = await loadForwardOriginal(source);
  if (!original) return { ok: false, error: "That email can't be found — it may have been deleted." };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Email sending isn't configured — RESEND_API_KEY is missing in Netlify." };
  }

  const originalSubject = original.subject || "(no subject)";
  const subject = /^fwd?:/i.test(originalSubject.trim()) ? originalSubject : `Fwd: ${originalSubject}`;
  const header = [
    "---------- Forwarded message ----------",
    `From: ${original.from}`,
    `Date: ${formatDateTime(original.at)}`,
    `Subject: ${originalSubject}`,
    `To: ${original.to}`,
  ];
  const text = `${note ? `${note}\n\n` : ""}${header.join("\n")}\n\n${original.text}`;
  const html = original.html
    ? `${note ? `<p>${escapeHtml(note).replace(/\n/g, "<br>")}</p>` : ""}<p>${header
        .map(escapeHtml)
        .join("<br>")}</p>${original.html}`
    : undefined;

  const attachments: { filename: string; content: Buffer }[] = [];
  for (const a of original.attachments) {
    const object = await getFromR2(a.r2Key);
    if (!object.Body) continue;
    attachments.push({ filename: a.filename, content: Buffer.from(await object.Body.transformToByteArray()) });
  }

  const fromAddress = (await getMailboxAddresses())[original.mailbox];
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: `${SENDER_NAMES[original.mailbox]} <${fromAddress}>`,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
  });
  if (error) return { ok: false, error: error.message || "Resend could not forward the email." };

  const sent = await db.outboundEmail.create({
    data: {
      resendEmailId: data?.id || null,
      fromAddress,
      toAddress: to,
      subject,
      body: text,
      kind: "FORWARD",
      mailbox: original.mailbox,
      artistId: original.artistId,
      customerId: original.customerId,
      taskId: original.taskId,
    },
    select: { id: true },
  });
  if (original.taskId && data?.id) await recordSentMessageId(resend, sent.id, data.id);

  revalidatePath("/accounts/inbox");
  return { ok: true };
}
