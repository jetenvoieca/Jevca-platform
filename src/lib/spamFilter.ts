import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { readJson } from "@/lib/claudeJson";
import { deleteFromR2 } from "@/lib/r2";

// The Inbox's spam filter (2026-10-20, direct request — cold pitches,
// mostly for web services, arriving at the addresses shown on the
// websites). Every email received at jevca.art or jetenvoieca.com is
// checked by Claude as it arrives (see processInboundEmail): spam goes to
// the Spam view instead of the Inbox, raises no alert, and is deleted 30
// days after arriving (deleteOldSpam, run daily). Not spam moves it back
// and trusts its sender from then on (TrustedSender).
//
// Senders already known are never checked: a trusted sender, an artist
// or customer it was matched to, a reply to an email sent from a task, or
// anyone the Inbox has sent to. When unsure, or if the check can't run,
// the email goes to the Inbox — a missed spam is a nuisance, a missed
// enquiry is a lost sale.

const MODEL = "claude-haiku-5-5";
const MAX_INPUT_CHARS = 6000;
export const SPAM_KEEP_DAYS = 30;
// How many old spam emails one daily run deletes — far more than arrive
// in a day, so the backlog can never grow.
const DELETE_BATCH = 500;

export function normaliseAddress(address: string): string {
  return address.trim().toLowerCase();
}

// True if this sender is never checked: trusted by Not spam, or sent to
// from the Inbox before (any mailbox, any kind of send).
export async function isKnownSender(address: string): Promise<boolean> {
  const sender = normaliseAddress(address);
  if (!sender) return false;
  const [trusted, sentTo] = await Promise.all([
    db.trustedSender.findUnique({ where: { address: sender }, select: { id: true } }),
    db.outboundEmail.findFirst({
      where: { toAddress: { equals: sender, mode: "insensitive" } },
      select: { id: true },
    }),
  ]);
  return trusted !== null || sentTo !== null;
}

export type SpamVerdict = { spam: false } | { spam: true; reason: string };

// Asks Claude whether a received email is spam. Anything that goes wrong
// counts as not spam (see above).
export async function checkForSpam(email: {
  fromAddress: string;
  fromName: string | null;
  toAddress: string;
  subject: string | null;
  text: string;
}): Promise<SpamVerdict> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("Spam filter skipped: ANTHROPIC_API_KEY is missing.");
    return { spam: false };
  }
  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system:
        "You sort email arriving at the business addresses of artists and of the art business that runs " +
        "their websites, galleries and sales. Decide whether an email is spam.\n" +
        "Spam: unsolicited sales pitches and cold outreach — website design or redesign, SEO, marketing, " +
        "social media, app development, lead generation, guest posts, link building, reviews, funding or " +
        "loans and the like; phishing; scams; bulk mail the recipient never asked for.\n" +
        "Not spam: anything from a real person writing about art, artworks, commissions, exhibitions, " +
        "galleries, sales, prices, invoices, payments, deliveries, events, press or collaboration on the " +
        "art itself; messages from clients, customers, suppliers and partners; replies; account, security " +
        "and billing notices from services the business uses (banks, Stripe, Google, hosting, couriers); " +
        "newsletters the recipient may have signed up to.\n" +
        "If in any doubt, it is not spam.",
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              spam: { type: "boolean", description: "True only if clearly spam." },
              reason: {
                type: "string",
                description: "A few words on why, e.g. 'Cold pitch for website design'.",
              },
            },
            required: ["spam", "reason"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "user",
          content:
            `From: ${email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress}\n` +
            `To: ${email.toAddress}\n` +
            `Subject: ${email.subject || "(no subject)"}\n\n` +
            email.text.slice(0, MAX_INPUT_CHARS),
        },
      ],
    });
    const out = readJson(response);
    if (out?.spam !== true) return { spam: false };
    const reason = typeof out.reason === "string" && out.reason.trim() ? out.reason.trim().slice(0, 200) : "Spam";
    return { spam: true, reason };
  } catch (err) {
    console.warn(`Spam filter skipped: ${err instanceof Error ? err.message : err}`);
    return { spam: false };
  }
}

// Removes an inbound email's stored attachment files from R2. A file that
// fails to delete never blocks deleting the email itself.
export async function deleteInboundAttachmentFiles(r2Keys: (string | null)[]): Promise<void> {
  for (const key of r2Keys) {
    if (!key) continue;
    try {
      await deleteFromR2(key);
    } catch {
      // See above.
    }
  }
}

// Deletes spam that arrived more than SPAM_KEEP_DAYS ago, with its
// attachments' files. Run daily (netlify/functions/clear-old-spam.mts).
// Returns how many were deleted.
export async function deleteOldSpam(): Promise<number> {
  const cutoff = new Date(Date.now() - SPAM_KEEP_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db.inboundEmail.findMany({
    where: { spamAt: { not: null }, receivedAt: { lt: cutoff } },
    select: { id: true, attachments: { select: { r2Key: true } } },
    take: DELETE_BATCH,
  });
  if (rows.length === 0) return 0;
  await deleteInboundAttachmentFiles(rows.flatMap((r) => r.attachments.map((a) => a.r2Key)));
  const { count } = await db.inboundEmail.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  return count;
}
