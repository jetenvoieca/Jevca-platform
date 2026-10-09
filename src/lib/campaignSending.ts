import { createHash, randomInt } from "crypto";
import { Resend } from "resend";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { artistCampaignAddresses } from "@/lib/email";
import { renderCampaignMail } from "@/lib/campaignMailRender";
import { DEFAULT_FOLLOW_UP, followUpDueAt, type FollowUpCondition } from "@/lib/campaignMails";
import { unsubscribeHeaders, unsubscribePageUrl } from "@/lib/unsubscribe";
import type { MailLanguage } from "@/lib/mailContent";

// Sending campaigns (2026-10-08, Marketing step 3d). A campaign set to
// send (now, or at a Paris time) is SCHEDULED; the sending runs (see
// app/api/campaigns/send-due and netlify/functions/send-campaigns*)
// start each one when its time comes — working out who gets which mail
// — and then send it in batches through Resend until everyone has had
// theirs. Each run works for a few seconds and stops; the next carries
// on where it left off, so nothing depends on one long request. A
// campaign's follow-up (step 4c) is started the same way when its day
// comes, and sent in the same batches.
// Server-only plain module.

// Emails per Resend batch call (Resend allows up to 100; fewer keeps
// each call's size modest), the pause between calls (Resend allows 2
// calls a second), and how long a batch taken by a run that then
// stopped is left before another run takes it again.
const BATCH_SIZE = 50;
const PAUSE_MS = 600;
const CLAIM_MINUTES = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Lang = "EN" | "FR";

function languageOf(value: string | null | undefined): Lang {
  return value?.toUpperCase() === "FR" ? "FR" : "EN";
}

const MAIL_LANGUAGE: Record<Lang, MailLanguage> = { EN: "en", FR: "fr" };

// ---------------------------------------------------------------------
// Who gets what
// ---------------------------------------------------------------------

export type SendCounts = { total: number; english: number; french: number; frenchSkipped: number };

type PlannedRecipient = {
  subscriberId: string;
  email: string;
  language: Lang;
  mailId: string;
  skipped: boolean;
};

type Plan = { recipients: PlannedRecipient[]; counts: SendCounts } | { problem: string };

// Shuffles in place (Fisher–Yates), so the mails' shares go to a random
// mix of people rather than, say, the oldest subscribers.
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// Who the campaign goes to: everyone subscribed on any of its lists,
// once each, in their own language (or the artist's); each gets the
// principal mail or an alternative, by the shares. French subscribers
// whose mail has no French subject are skipped (Craig's rule).
export async function planCampaign(campaignId: string): Promise<Plan> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: {
      site: { select: { artistId: true, artist: { select: { invoiceLanguage: true } } } },
      lists: { select: { listId: true } },
      mails: {
        where: { kind: { in: ["PRINCIPAL", "ALTERNATIVE"] } },
        orderBy: { position: "asc" },
        select: { id: true, kind: true, position: true, sharePercent: true, subjectEn: true, subjectFr: true },
      },
    },
  });
  if (!campaign) return { problem: "Campaign not found." };
  if (campaign.lists.length === 0) return { problem: "Choose at least one mail list." };

  const principal = campaign.mails.find((m) => m.kind === "PRINCIPAL");
  if (!principal) return { problem: "The campaign has no principal mail." };
  const alternatives = campaign.mails.filter((m) => m.kind === "ALTERNATIVE");
  const missingEnglish = campaign.mails.find((m) => !m.subjectEn?.trim());
  if (missingEnglish) {
    const name = missingEnglish.kind === "PRINCIPAL" ? "The principal mail" : `Alternative mail ${missingEnglish.position}`;
    return { problem: `${name} has no English subject.` };
  }

  const subscribers = await db.subscriber.findMany({
    where: {
      artistId: campaign.site.artistId,
      status: "SUBSCRIBED",
      lists: { some: { listId: { in: campaign.lists.map((l) => l.listId) } } },
    },
    select: { id: true, email: true, language: true },
  });
  if (subscribers.length === 0) return { problem: "No one subscribed is on the chosen lists." };

  // How many get each mail: each alternative its share, the principal
  // mail the rest.
  shuffle(subscribers);
  const total = subscribers.length;
  const slots: { mail: (typeof campaign.mails)[number]; count: number }[] = alternatives.map((mail) => ({
    mail,
    count: Math.round((total * (mail.sharePercent ?? 0)) / 100),
  }));
  const altCount = slots.reduce((sum, s) => sum + s.count, 0);
  slots.unshift({ mail: principal, count: Math.max(0, total - altCount) });

  const fallback = languageOf(campaign.site.artist.invoiceLanguage);
  const recipients: PlannedRecipient[] = [];
  let next = 0;
  for (const { mail, count } of slots) {
    for (const s of subscribers.slice(next, next + count)) {
      const language = s.language ? languageOf(s.language) : fallback;
      recipients.push({
        subscriberId: s.id,
        email: s.email,
        language,
        mailId: mail.id,
        skipped: language === "FR" && !mail.subjectFr?.trim(),
      });
    }
    next += count;
  }

  const french = recipients.filter((r) => r.language === "FR");
  return {
    recipients,
    counts: {
      total: recipients.filter((r) => !r.skipped).length,
      english: recipients.length - french.length,
      french: french.filter((r) => !r.skipped).length,
      frenchSkipped: french.filter((r) => r.skipped).length,
    },
  };
}

// ---------------------------------------------------------------------
// The sending runs
// ---------------------------------------------------------------------

// Starts every scheduled campaign whose time has come: marks it SENDING
// (only one run can) and writes down who gets which mail. A campaign
// that can no longer go (its lists emptied, a subject removed…) goes
// back to DRAFT with the reason.
async function startDueCampaigns(): Promise<void> {
  const due = await db.campaign.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: "asc" },
    take: 20,
    select: { id: true },
  });
  for (const { id } of due) {
    const { count } = await db.campaign.updateMany({
      where: { id, status: "SCHEDULED" },
      data: { status: "SENDING", startedAt: new Date(), sendError: null },
    });
    if (count !== 1) continue;

    const plan = await planCampaign(id);
    if ("problem" in plan) {
      await db.campaign.update({
        where: { id },
        data: { status: "DRAFT", startedAt: null, sendError: plan.problem },
      });
      continue;
    }
    for (let i = 0; i < plan.recipients.length; i += 1000) {
      await db.campaignRecipient.createMany({
        data: plan.recipients.slice(i, i + 1000).map((r) => ({
          campaignId: id,
          mailId: r.mailId,
          subscriberId: r.subscriberId,
          email: r.email,
          language: r.language,
          status: r.skipped ? "SKIPPED" : "PENDING",
          error: r.skipped ? "No French subject" : null,
        })),
        skipDuplicates: true,
      });
    }
  }
}

// ---------------------------------------------------------------------
// Follow-ups (2026-10-09, step 4c)
// ---------------------------------------------------------------------

// Who a follow-up goes to, from what happened to the campaign's mail.
// Anyone whose mail bounced or who marked it as spam is never included.
const FOLLOW_UP_WHO: Record<FollowUpCondition, Prisma.CampaignRecipientWhereInput> = {
  NOT_OPENED: { openedAt: null },
  OPENED: { openedAt: { not: null } },
  CLICKED: { clickedAt: { not: null } },
  NOT_CLICKED: { clickedAt: null },
};

// Starts every follow-up whose day has come: chooses its recipients
// (each in the language they got the campaign in; French ones skipped
// if the follow-up has no French subject) in one step with marking it
// started, so it's done once. One that can't go yet (no English
// subject) says why, and goes once that's fixed.
async function startDueFollowUps(): Promise<void> {
  const waiting = await db.campaignMail.findMany({
    where: { kind: "FOLLOW_UP", followUpStartedAt: null, campaign: { status: "SENT", sentAt: { not: null } } },
    select: {
      id: true,
      campaignId: true,
      followUpCondition: true,
      followUpDays: true,
      subjectEn: true,
      subjectFr: true,
      followUpError: true,
      campaign: { select: { sentAt: true } },
    },
  });
  const now = Date.now();
  for (const mail of waiting) {
    const days = mail.followUpDays ?? DEFAULT_FOLLOW_UP.days;
    if (followUpDueAt(mail.campaign.sentAt!, days).getTime() > now) continue;

    if (!mail.subjectEn?.trim()) {
      const problem = "The follow-up mail has no English subject.";
      if (mail.followUpError !== problem) {
        await db.campaignMail.update({ where: { id: mail.id }, data: { followUpError: problem } });
      }
      continue;
    }

    const condition = mail.followUpCondition ?? DEFAULT_FOLLOW_UP.condition;
    const chosen = await db.campaignRecipient.findMany({
      where: {
        campaignId: mail.campaignId,
        status: "SENT",
        mail: { kind: { in: ["PRINCIPAL", "ALTERNATIVE"] } },
        bouncedAt: null,
        complainedAt: null,
        subscriber: { status: "SUBSCRIBED" },
        ...FOLLOW_UP_WHO[condition],
      },
      select: { subscriberId: true, email: true, language: true },
    });
    const hasFrench = !!mail.subjectFr?.trim();

    await db.$transaction(async (tx) => {
      const { count } = await tx.campaignMail.updateMany({
        where: { id: mail.id, followUpStartedAt: null },
        data: { followUpStartedAt: new Date(), followUpError: null },
      });
      if (count !== 1) return;
      for (let i = 0; i < chosen.length; i += 1000) {
        await tx.campaignRecipient.createMany({
          data: chosen.slice(i, i + 1000).map((r) => {
            const skipped = languageOf(r.language) === "FR" && !hasFrench;
            return {
              campaignId: mail.campaignId,
              mailId: mail.id,
              subscriberId: r.subscriberId,
              email: r.email,
              language: r.language,
              status: skipped ? "SKIPPED" : "PENDING",
              error: skipped ? "No French subject" : null,
            };
          }),
          skipDuplicates: true,
        });
      }
    });
  }
}

// ---------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------

// Recipients waiting to be sent: those of a campaign that's sending, and
// those of a follow-up that has started (its rows only exist once it
// has).
const SENDABLE: Prisma.CampaignRecipientWhereInput = {
  status: "PENDING",
  OR: [{ campaign: { status: "SENDING" } }, { mail: { kind: "FOLLOW_UP" } }],
};

// Takes the next batch of one campaign's waiting recipients for this run
// (never one another run is working on), all for the same mail stage —
// the campaign's own mails, or its follow-up.
async function claimBatch(): Promise<{ campaignId: string; ids: string[] } | null> {
  const stale = new Date(Date.now() - CLAIM_MINUTES * 60_000);
  // (Both times are passed in, like every other date here, so the
  // database's own clock and time zone never come into it.)
  const next = await db.campaignRecipient.findFirst({
    where: {
      AND: [SENDABLE, { OR: [{ claimedAt: null }, { claimedAt: { lt: stale } }] }],
    },
    orderBy: { createdAt: "asc" },
    select: { campaignId: true },
  });
  if (!next) return null;
  const now = new Date();
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "CampaignRecipient" SET "claimedAt" = ${now}
    WHERE "id" IN (
      SELECT "id" FROM "CampaignRecipient"
      WHERE "campaignId" = ${next.campaignId}
        AND "status" = 'PENDING'
        AND ("claimedAt" IS NULL OR "claimedAt" < ${stale})
      ORDER BY "id"
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id"`;
  return rows.length > 0 ? { campaignId: next.campaignId, ids: rows.map((r) => r.id).sort() } : null;
}

// The mail's HTML is the same for everyone getting it in a language,
// except their own unsubscribe link — so it's drawn once with a stand-in
// for the token, swapped for each person.
const TOKEN_STAND_IN = "UNSUBSCRIBETOKENSTANDIN";

type DrawnMail = { subject: string; html: string };

async function sendBatch(resend: Resend, batch: { campaignId: string; ids: string[] }, cache: Map<string, DrawnMail>) {
  const campaign = await db.campaign.findUnique({
    where: { id: batch.campaignId },
    select: { id: true, siteId: true, site: { select: { artist: { select: { name: true, emailSlug: true } } } } },
  });
  const recipients = await db.campaignRecipient.findMany({
    where: { id: { in: batch.ids } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      email: true,
      language: true,
      mail: { select: { id: true, layout: true, content: true, subjectEn: true, subjectFr: true, previewEn: true, previewFr: true } },
      subscriber: { select: { status: true, unsubscribeToken: true } },
    },
  });
  if (!campaign) return;
  const addresses = artistCampaignAddresses(campaign.site.artist);
  if (!addresses.ok) {
    await db.campaignRecipient.updateMany({
      where: { id: { in: batch.ids } },
      data: { status: "FAILED", error: addresses.error },
    });
    return;
  }

  // Anyone who unsubscribed (or was removed) since the campaign started
  // is skipped.
  const gone = recipients.filter((r) => !r.subscriber || r.subscriber.status !== "SUBSCRIBED");
  if (gone.length > 0) {
    await db.campaignRecipient.updateMany({
      where: { id: { in: gone.map((r) => r.id) } },
      data: { status: "SKIPPED", error: "Unsubscribed" },
    });
  }
  const sending = recipients.filter((r) => r.subscriber?.status === "SUBSCRIBED");
  if (sending.length === 0) return;

  const emails = [];
  for (const r of sending) {
    const language = MAIL_LANGUAGE[languageOf(r.language)];
    const key = `${r.mail.id}:${language}`;
    let drawn = cache.get(key);
    if (!drawn) {
      const result = await renderCampaignMail(
        campaign.siteId,
        {
          layout: r.mail.layout,
          content: r.mail.content,
          subject: { en: r.mail.subjectEn ?? "", fr: r.mail.subjectFr ?? "" },
          preview: { en: r.mail.previewEn ?? "", fr: r.mail.previewFr ?? "" },
        },
        language,
        { unsubscribeUrl: unsubscribePageUrl(TOKEN_STAND_IN) }
      );
      if ("error" in result) throw new Error(result.error);
      drawn = result;
      cache.set(key, drawn);
    }
    const token = r.subscriber!.unsubscribeToken;
    emails.push({
      from: addresses.from,
      replyTo: addresses.replyTo,
      to: r.email,
      subject: drawn.subject,
      html: drawn.html.split(TOKEN_STAND_IN).join(token),
      headers: unsubscribeHeaders(token),
      tags: [
        { name: "campaign", value: campaign.id },
        { name: "mail", value: r.mail.id },
      ],
    });
  }

  // The same batch sent again (after a run stopped part-way) has the same
  // key, so Resend doesn't send it twice.
  const idempotencyKey = `campaign-${campaign.id}-${createHash("sha256").update(sending.map((r) => r.id).join(",")).digest("hex").slice(0, 32)}`;
  const { data, error } = await resend.batch.send(emails, { idempotencyKey, batchValidation: "permissive" });
  if (error) {
    // Let another run try these again.
    await db.campaignRecipient.updateMany({ where: { id: { in: batch.ids } }, data: { claimedAt: null } });
    throw new Error(error.message || "Resend refused the batch.");
  }

  const failed = new Map((data?.errors ?? []).map((e) => [e.index, e.message]));
  const ids = data?.data ?? [];
  let nextId = 0;
  const now = new Date();
  await db.$transaction(
    sending.map((r, index) =>
      failed.has(index)
        ? db.campaignRecipient.update({
            where: { id: r.id },
            data: { status: "FAILED", error: failed.get(index)?.slice(0, 500) ?? "Failed" },
          })
        : db.campaignRecipient.update({
            where: { id: r.id },
            data: { status: "SENT", sentAt: now, resendEmailId: ids[nextId++]?.id ?? null },
          })
    )
  );
}

// A sending campaign with no one left waiting is SENT; so is a started
// follow-up.
async function finishCampaigns(): Promise<void> {
  const sending = await db.campaign.findMany({ where: { status: "SENDING" }, select: { id: true } });
  for (const { id } of sending) {
    const waiting = await db.campaignRecipient.count({ where: { campaignId: id, status: "PENDING" } });
    if (waiting === 0) {
      await db.campaign.updateMany({ where: { id, status: "SENDING" }, data: { status: "SENT", sentAt: new Date() } });
    }
  }
  const followUps = await db.campaignMail.findMany({
    where: { kind: "FOLLOW_UP", followUpStartedAt: { not: null }, followUpSentAt: null },
    select: { id: true },
  });
  for (const { id } of followUps) {
    const waiting = await db.campaignRecipient.count({ where: { mailId: id, status: "PENDING" } });
    if (waiting === 0) {
      await db.campaignMail.updateMany({ where: { id, followUpSentAt: null }, data: { followUpSentAt: new Date() } });
    }
  }
}

// One sending run: starts what's due, sends batches for about
// `budgetMs`, and marks finished campaigns. `more` says whether there's
// still sending to do, so the caller runs again.
export async function runCampaignSending(budgetMs: number): Promise<{ more: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { more: false, error: "RESEND_API_KEY is missing." };
  const until = Date.now() + budgetMs;
  const resend = new Resend(apiKey);
  const cache = new Map<string, DrawnMail>();
  let error: string | undefined;

  await startDueCampaigns();
  await startDueFollowUps();
  while (Date.now() < until) {
    const batch = await claimBatch();
    if (!batch) break;
    try {
      await sendBatch(resend, batch, cache);
    } catch (err) {
      error = err instanceof Error ? err.message : "Sending failed.";
      break;
    }
    await sleep(PAUSE_MS);
  }
  await finishCampaigns();

  const more =
    (await db.campaignRecipient.count({ where: SENDABLE })) > 0 ||
    (await db.campaign.count({ where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } } })) > 0;
  return { more, ...(error ? { error } : {}) };
}

// Wakes the sending runs straight away (Send now) instead of waiting for
// the next 5-minute check. If it can't, the check still picks it up.
export async function wakeCampaignSending(): Promise<void> {
  const base = process.env.URL;
  const secret = process.env.CAMPAIGN_SEND_SECRET;
  if (!base || !secret) return;
  try {
    await fetch(`${base}/.netlify/functions/send-campaigns-background`, {
      method: "POST",
      headers: { "x-campaign-send-secret": secret },
    });
  } catch {
    // The scheduled check will start it.
  }
}
