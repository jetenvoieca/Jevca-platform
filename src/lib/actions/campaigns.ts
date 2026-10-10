"use server";

import { db } from "@/lib/db";
import { normalizeMailTemplate, withTemplateLook, type MailTemplateLayout } from "@/lib/mailTemplateLayout";
import {
  DEFAULT_FOLLOW_UP,
  SHARE_LIMITS,
  campaignMailOrder,
  cleanFollowUpDays,
  defaultShares,
  followUpDueAt,
  isFollowUpCondition,
  principalShare,
  MAX_ALTERNATIVES,
  type CampaignMailKind,
  type FollowUpCondition,
} from "@/lib/campaignMails";
import {
  MAIL_LANGUAGES,
  cleanMailContent,
  mailReferences,
  moveMailContent,
  pictureKey,
  type Localized,
  type MailContent,
  type MailLanguage,
} from "@/lib/mailContent";
import { Resend } from "resend";
import { loadMailAssets } from "@/lib/mailAssets";
import { artistCampaignAddresses } from "@/lib/email";
import { planCampaign, wakeCampaignSending, type SendCounts } from "@/lib/campaignSending";
import { parisToDate } from "@/lib/parisTime";
import {
  cleanSubjectLine,
  renderCampaignMail,
  type CampaignMailSource,
} from "@/lib/campaignMailRender";
import { TEST_UNSUBSCRIBE_TOKEN, unsubscribeHeaders, unsubscribePageUrl } from "@/lib/unsubscribe";

// Marketing → Mail Campaigns (2026-10-08, step 3) — see Campaign and
// CampaignMail in schema.prisma, and lib/campaignMails.ts for how a
// campaign's mails fit together. Every action is scoped by the site the
// page belongs to. No revalidatePath: the page keeps its own list up to
// date.

export type CampaignMailData = {
  id: string;
  kind: CampaignMailKind;
  position: number;
  templateId: string | null;
  // An alternative's share of the audience (null for the other mails).
  sharePercent: number | null;
  // The follow-up's condition and days (null for the other mails).
  followUp: { condition: FollowUpCondition; days: number } | null;
  // How the follow-up's sending stands (null for the other mails), ISO
  // times: when it's due (once the campaign has been sent), started,
  // finished, and why it couldn't start yet. It can't change once
  // started.
  followUpSending: FollowUpSending | null;
  layout: MailTemplateLayout;
  content: MailContent;
  subject: Localized<string>;
  preview: Localized<string>;
};

export type FollowUpSending = {
  dueAt: string | null;
  startedAt: string | null;
  sentAt: string | null;
  error: string | null;
};

export type CampaignStatus = "DRAFT" | "SCHEDULED" | "SENDING" | "SENT";

// How a campaign's sending is going (once it has started).
export type CampaignProgress = { sent: number; skipped: number; failed: number; waiting: number };

export type CampaignSummary = {
  id: string;
  name: string;
  mails: CampaignMailData[];
  status: CampaignStatus;
  // When it's set to send, and when it finished (ISO).
  scheduledAt: string | null;
  sentAt: string | null;
  // Why a scheduled campaign couldn't start.
  sendError: string | null;
  // The mail lists it goes to.
  listIds: string[];
  progress: CampaignProgress | null;
};

// A campaign's mails can be changed until sending starts (Craig's
// choice: locked once sent); the follow-up stays editable until it goes.
const EDITABLE: CampaignStatus[] = ["DRAFT", "SCHEDULED"];
const SENT_MESSAGE = "This campaign has been sent, so it can't change — duplicate it to send something similar.";

// The Add / Edit window: the campaign's name, and its mails with the
// template each starts from. `id` is null for a mail being added; a
// mail left out is removed. `templateId` null keeps the mail's layout
// as it is.
export type CampaignMailSetup = { id: string | null; kind: CampaignMailKind; templateId: string | null };
export type CampaignSetup = { name: string; mails: CampaignMailSetup[] };

// What the mail editor saves (and the Preview and Test message draw).
export type CampaignMailInput = CampaignMailSource;

type Result = { ok: true } | { error: string };

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

const MAIL_SELECT = {
  id: true,
  kind: true,
  position: true,
  templateId: true,
  sharePercent: true,
  followUpCondition: true,
  followUpDays: true,
  followUpStartedAt: true,
  followUpSentAt: true,
  followUpError: true,
  layout: true,
  content: true,
  subjectEn: true,
  subjectFr: true,
  previewEn: true,
  previewFr: true,
} as const;

const CAMPAIGN_SELECT = {
  id: true,
  name: true,
  status: true,
  scheduledAt: true,
  sentAt: true,
  sendError: true,
  lists: { select: { listId: true } },
  mails: { select: MAIL_SELECT },
} as const;

type CampaignRow = {
  id: string;
  name: string;
  status: CampaignStatus;
  scheduledAt: Date | null;
  sentAt: Date | null;
  sendError: string | null;
  lists: { listId: string }[];
  mails: MailRow[];
};

type MailRow = {
  id: string;
  kind: CampaignMailKind;
  position: number;
  templateId: string | null;
  sharePercent: number | null;
  followUpCondition: FollowUpCondition | null;
  followUpDays: number | null;
  followUpStartedAt: Date | null;
  followUpSentAt: Date | null;
  followUpError: string | null;
  layout: unknown;
  content: unknown;
  subjectEn: string | null;
  subjectFr: string | null;
  previewEn: string | null;
  previewFr: string | null;
};

// `campaignSentAt`: when the campaign finished sending, from which the
// follow-up's day is counted.
function toMailData(row: MailRow, campaignSentAt: Date | null): CampaignMailData {
  const layout = normalizeMailTemplate(row.layout);
  const days = row.followUpDays ?? DEFAULT_FOLLOW_UP.days;
  return {
    id: row.id,
    kind: row.kind,
    position: row.position,
    templateId: row.templateId,
    sharePercent: row.kind === "ALTERNATIVE" ? (row.sharePercent ?? SHARE_LIMITS.min) : null,
    followUp:
      row.kind === "FOLLOW_UP"
        ? {
            condition: row.followUpCondition ?? DEFAULT_FOLLOW_UP.condition,
            days,
          }
        : null,
    followUpSending:
      row.kind === "FOLLOW_UP"
        ? {
            dueAt: campaignSentAt ? followUpDueAt(campaignSentAt, days).toISOString() : null,
            startedAt: row.followUpStartedAt?.toISOString() ?? null,
            sentAt: row.followUpSentAt?.toISOString() ?? null,
            error: row.followUpError,
          }
        : null,
    layout,
    content: cleanMailContent(row.content, layout),
    subject: { en: row.subjectEn ?? "", fr: row.subjectFr ?? "" },
    preview: { en: row.previewEn ?? "", fr: row.previewFr ?? "" },
  };
}

// Each campaign's recipients counted by how their mail went, for the
// campaigns that have started sending (the follow-up's aren't counted:
// this is the campaign's own sending).
async function progressOf(rows: CampaignRow[]): Promise<Map<string, CampaignProgress>> {
  const started = rows.filter((r) => r.status === "SENDING" || r.status === "SENT").map((r) => r.id);
  const progress = new Map<string, CampaignProgress>();
  if (started.length === 0) return progress;
  const groups = await db.campaignRecipient.groupBy({
    by: ["campaignId", "status"],
    where: { campaignId: { in: started }, mail: { kind: { not: "FOLLOW_UP" } } },
    _count: { _all: true },
  });
  for (const id of started) progress.set(id, { sent: 0, skipped: 0, failed: 0, waiting: 0 });
  for (const g of groups) {
    const p = progress.get(g.campaignId)!;
    const n = g._count._all;
    if (g.status === "SENT") p.sent += n;
    else if (g.status === "SKIPPED") p.skipped += n;
    else if (g.status === "FAILED") p.failed += n;
    else p.waiting += n;
  }
  return progress;
}

function toSummary(row: CampaignRow, progress: Map<string, CampaignProgress>): CampaignSummary {
  const mails = row.mails
    .map((m) => toMailData(m, row.sentAt))
    .sort((a, b) => campaignMailOrder(a) - campaignMailOrder(b));
  return {
    id: row.id,
    name: row.name,
    mails,
    status: row.status,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    sendError: row.sendError,
    listIds: row.lists.map((l) => l.listId),
    progress: progress.get(row.id) ?? null,
  };
}

async function summaryOf(id: string, siteId: string): Promise<CampaignSummary | null> {
  const row = await db.campaign.findFirst({ where: { id, siteId }, select: CAMPAIGN_SELECT });
  return row ? toSummary(row, await progressOf([row])) : null;
}

// Newest first, as campaigns are made one after another.
export async function listCampaigns(siteId: string): Promise<CampaignSummary[]> {
  const rows = await db.campaign.findMany({
    where: { siteId },
    orderBy: { createdAt: "desc" },
    select: CAMPAIGN_SELECT,
  });
  const progress = await progressOf(rows);
  return rows.map((r) => toSummary(r, progress));
}

// One campaign as it stands now — the page asks again every few seconds
// while it's sending.
export async function getCampaign(id: string, siteId: string): Promise<CampaignSummary | null> {
  return summaryOf(id, siteId);
}

// Whether the window's mails make a valid campaign: one principal mail,
// up to 2 alternatives and at most one follow-up.
function checkSetup(mails: CampaignMailSetup[]): string | null {
  const count = (kind: CampaignMailKind) => mails.filter((m) => m.kind === kind).length;
  if (count("PRINCIPAL") !== 1) return "A campaign has one principal mail.";
  if (count("ALTERNATIVE") > MAX_ALTERNATIVES)
    return `A campaign has at most ${MAX_ALTERNATIVES} alternative mails.`;
  if (count("FOLLOW_UP") > 1) return "A campaign has at most one follow-up mail.";
  if (mails.some((m) => !m.id && !m.templateId)) return "Choose a template for each new mail.";
  return null;
}

// Adds a campaign (`id` null) or saves the Add / Edit window for one:
// its name, and its mails with their templates. A new mail starts as a
// copy of its template. A mail switched to another template takes that
// template's layout, its content moved across by moveMailContent (the
// window has already warned about anything that won't fit). A mail left
// out is removed. When the alternatives change, their shares start again
// from the defaults.
export async function saveCampaign(
  siteId: string,
  id: string | null,
  setup: CampaignSetup
): Promise<{ campaign: CampaignSummary } | { error: string }> {
  const name = setup.name.trim();
  if (!name) return { error: "Give the campaign a name." };
  const problem = checkSetup(setup.mails);
  if (problem) return { error: problem };

  const templateIds = [...new Set(setup.mails.flatMap((m) => (m.templateId ? [m.templateId] : [])))];
  const templates = new Map(
    (
      await db.mailTemplate.findMany({
        where: { id: { in: templateIds } },
        select: { id: true, layout: true },
      })
    ).map((t) => [t.id, normalizeMailTemplate(t.layout)])
  );
  if (templates.size !== templateIds.length) return { error: "A chosen template no longer exists." };

  const existing = id
    ? await db.campaign.findFirst({
        where: { id, siteId },
        select: {
          status: true,
          mails: { select: { id: true, kind: true, templateId: true, layout: true, content: true } },
        },
      })
    : null;
  if (id && !existing) return { error: "Campaign not found." };
  if (existing && !EDITABLE.includes(existing.status)) return { error: SENT_MESSAGE };
  const current = new Map((existing?.mails ?? []).map((m) => [m.id, m]));
  for (const m of setup.mails) {
    const found = m.id ? current.get(m.id) : null;
    if (m.id && (!found || found.kind !== m.kind)) return { error: "Mail not found." };
  }

  const keptAlternatives = new Set(
    setup.mails.filter((m) => m.kind === "ALTERNATIVE" && m.id).map((m) => m.id)
  );
  const alternatives = setup.mails.filter((m) => m.kind === "ALTERNATIVE");
  const oldAlternatives = (existing?.mails ?? []).filter((m) => m.kind === "ALTERNATIVE");
  const alternativesChanged =
    alternatives.length !== oldAlternatives.length ||
    oldAlternatives.some((m) => !keptAlternatives.has(m.id));
  const shares = defaultShares(alternatives.length);

  try {
    const campaignId = await db.$transaction(async (tx) => {
      const campaign = id
        ? await tx.campaign.update({ where: { id }, data: { name }, select: { id: true } })
        : await tx.campaign.create({ data: { siteId, name }, select: { id: true } });

      const removed = [...current.keys()].filter((mailId) => !setup.mails.some((m) => m.id === mailId));
      if (removed.length > 0) {
        await tx.campaignMail.deleteMany({ where: { id: { in: removed }, campaignId: campaign.id } });
      }

      for (const m of setup.mails) {
        const position = m.kind === "ALTERNATIVE" ? alternatives.indexOf(m) + 1 : 0;
        const share =
          m.kind === "ALTERNATIVE" && alternativesChanged ? { sharePercent: shares[position - 1] } : {};
        const template = m.templateId ? templates.get(m.templateId)! : null;
        const old = m.id ? current.get(m.id) : null;

        if (old) {
          const switched = template && m.templateId !== old.templateId;
          const layout = switched ? template : null;
          await tx.campaignMail.update({
            where: { id: old.id },
            data: {
              position,
              ...share,
              ...(layout
                ? {
                    templateId: m.templateId,
                    layout,
                    content: moveMailContent(
                      cleanMailContent(old.content, normalizeMailTemplate(old.layout)),
                      normalizeMailTemplate(old.layout),
                      layout
                    ).content,
                  }
                : {}),
            },
          });
        } else if (template) {
          await tx.campaignMail.create({
            data: {
              campaignId: campaign.id,
              kind: m.kind,
              templateId: m.templateId,
              position,
              ...share,
              ...(m.kind === "FOLLOW_UP"
                ? { followUpCondition: DEFAULT_FOLLOW_UP.condition, followUpDays: DEFAULT_FOLLOW_UP.days }
                : {}),
              layout: template,
              content: {},
            },
          });
        }
      }
      return campaign.id;
    });

    const saved = await summaryOf(campaignId, siteId);
    return saved ? { campaign: saved } : { error: "Campaign not found." };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A campaign with that name already exists." };
    throw err;
  }
}

// A copy of the campaign and its mails, named "<name> (copy)" — or
// "(copy 2)", "(copy 3)"… if that's taken.
export async function duplicateCampaign(
  id: string,
  siteId: string
): Promise<{ campaign: CampaignSummary } | { error: string }> {
  const source = await db.campaign.findFirst({
    where: { id, siteId },
    select: { name: true, lists: { select: { listId: true } }, mails: { select: MAIL_SELECT } },
  });
  if (!source) return { error: "Campaign not found." };

  let name = `${source.name} (copy)`;
  for (
    let n = 2;
    await db.campaign.findUnique({ where: { siteId_name: { siteId, name } }, select: { id: true } });
    n++
  ) {
    name = `${source.name} (copy ${n})`;
  }

  try {
    const campaign = await db.campaign.create({
      data: {
        siteId,
        name,
        lists: { create: source.lists.map((l) => ({ listId: l.listId })) },
        mails: {
          create: source.mails.map((m) => ({
            kind: m.kind,
            templateId: m.templateId,
            position: m.position,
            sharePercent: m.sharePercent,
            followUpCondition: m.followUpCondition,
            followUpDays: m.followUpDays,
            layout: m.layout ?? {},
            content: m.content ?? {},
            subjectEn: m.subjectEn,
            subjectFr: m.subjectFr,
            previewEn: m.previewEn,
            previewFr: m.previewFr,
          })),
        },
      },
      select: CAMPAIGN_SELECT,
    });
    return { campaign: toSummary(campaign, new Map()) };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "Couldn't duplicate — try again." };
    throw err;
  }
}

// Not while it's sending — once it has finished, it (and its record of
// who got it) can go.
export async function deleteCampaign(id: string, siteId: string): Promise<Result> {
  const { count } = await db.campaign.deleteMany({ where: { id, siteId, status: { not: "SENDING" } } });
  return count === 1 ? { ok: true } : { error: "A campaign can't be deleted while it's sending." };
}

// An alternative's share of the audience. The alternatives together
// must leave at least 1% for the principal mail.
export async function setAlternativeShare(
  mailId: string,
  siteId: string,
  percent: number
): Promise<Result> {
  const share = Math.round(percent);
  if (!Number.isFinite(share) || share < SHARE_LIMITS.min || share > SHARE_LIMITS.max) {
    return { error: `A share is between ${SHARE_LIMITS.min}% and ${SHARE_LIMITS.max}%.` };
  }
  const mail = await db.campaignMail.findFirst({
    where: { id: mailId, kind: "ALTERNATIVE", campaign: { siteId } },
    select: { campaignId: true, campaign: { select: { status: true } } },
  });
  if (!mail) return { error: "Mail not found." };
  if (!EDITABLE.includes(mail.campaign.status)) return { error: SENT_MESSAGE };
  const others = await db.campaignMail.findMany({
    where: { campaignId: mail.campaignId, kind: "ALTERNATIVE", id: { not: mailId } },
    select: { sharePercent: true },
  });
  const shares = [...others.map((o) => o.sharePercent ?? SHARE_LIMITS.min), share];
  if (principalShare(shares) < SHARE_LIMITS.min) {
    return { error: "The alternatives can total at most 99% — the principal mail needs the rest." };
  }
  await db.campaignMail.update({ where: { id: mailId }, data: { sharePercent: share } });
  return { ok: true };
}

const FOLLOW_UP_SENT_MESSAGE = "The follow-up has been sent, so it can't change.";

// Who the follow-up mail goes to, and how many days after the campaign —
// until it starts sending.
export async function setFollowUp(
  mailId: string,
  siteId: string,
  input: { condition: string; days: number }
): Promise<Result> {
  if (!isFollowUpCondition(input.condition)) return { error: "Choose who the follow-up goes to." };
  const { count } = await db.campaignMail.updateMany({
    where: { id: mailId, kind: "FOLLOW_UP", campaign: { siteId }, followUpStartedAt: null },
    data: { followUpCondition: input.condition, followUpDays: cleanFollowUpDays(input.days) },
  });
  return count === 1 ? { ok: true } : { error: FOLLOW_UP_SENT_MESSAGE };
}

// Saves a mail's layout, content, subject and preview text — each
// cleaned with the same rules the editor uses, so whatever is saved is
// always valid. Content for removed components is dropped. The look
// (colours, spacing, margins, text styles) is always its template's, so
// a page opened before the template changed can't put the old look back.
export async function updateCampaignMail(
  mailId: string,
  siteId: string,
  input: CampaignMailInput
): Promise<Result> {
  const editable = {
    id: mailId,
    campaign: { siteId },
    OR: [{ kind: "FOLLOW_UP" as const, followUpStartedAt: null }, { campaign: { status: { in: EDITABLE } } }],
  };
  const mail = await db.campaignMail.findFirst({
    where: editable,
    select: { template: { select: { layout: true } } },
  });
  if (!mail) return { error: SENT_MESSAGE };
  const own = normalizeMailTemplate(input.layout);
  const layout = mail.template ? withTemplateLook(own, normalizeMailTemplate(mail.template.layout)) : own;
  const { count } = await db.campaignMail.updateMany({
    where: editable,
    data: {
      layout,
      content: cleanMailContent(input.content, layout),
      subjectEn: cleanSubjectLine(input.subject?.en),
      subjectFr: cleanSubjectLine(input.subject?.fr),
      previewEn: cleanSubjectLine(input.preview?.en),
      previewFr: cleanSubjectLine(input.preview?.fr),
    },
  });
  return count === 1 ? { ok: true } : { error: SENT_MESSAGE };
}

// ---- Audience and sending ----

// The mail lists the campaign goes to (only the artist's own).
export async function setCampaignLists(id: string, siteId: string, listIds: string[]): Promise<Result> {
  const campaign = await db.campaign.findFirst({
    where: { id, siteId },
    select: { status: true, site: { select: { artistId: true } } },
  });
  if (!campaign) return { error: "Campaign not found." };
  if (!EDITABLE.includes(campaign.status)) return { error: SENT_MESSAGE };
  const lists = await db.mailList.findMany({
    where: { id: { in: listIds }, artistId: campaign.site.artistId },
    select: { id: true },
  });
  await db.$transaction([
    db.campaignList.deleteMany({ where: { campaignId: id } }),
    db.campaignList.createMany({ data: lists.map((l) => ({ campaignId: id, listId: l.id })) }),
  ]);
  return { ok: true };
}

// What sending would do, for the confirmation: how many get it, in each
// language, and how many French subscribers are skipped (no French
// subject) — or why it can't go.
export async function getCampaignSendCounts(
  id: string,
  siteId: string
): Promise<{ counts: SendCounts } | { error: string }> {
  const campaign = await db.campaign.findFirst({ where: { id, siteId }, select: { id: true } });
  if (!campaign) return { error: "Campaign not found." };
  const plan = await planCampaign(id);
  return "problem" in plan ? { error: plan.problem } : { counts: plan.counts };
}

// Send now (`at` null) or Send at a Paris date and time. The campaign is
// SCHEDULED; the sending runs start it when its time comes (Send now
// wakes them straight away). It can still be changed or cancelled until
// then.
export async function scheduleCampaignSend(
  id: string,
  siteId: string,
  at: { date: string; time: string } | null
): Promise<{ campaign: CampaignSummary } | { error: string }> {
  const when = at ? parisToDate(at.date, at.time) : new Date();
  if (!when) return { error: "Choose a date and time." };
  if (at && when.getTime() < Date.now() - 60_000) return { error: "That time has already passed." };

  const campaign = await db.campaign.findFirst({ where: { id, siteId }, select: { status: true } });
  if (!campaign) return { error: "Campaign not found." };
  if (!EDITABLE.includes(campaign.status)) return { error: SENT_MESSAGE };
  const plan = await planCampaign(id);
  if ("problem" in plan) return { error: plan.problem };

  await db.campaign.update({
    where: { id },
    data: { status: "SCHEDULED", scheduledAt: when, sendError: null },
  });
  if (!at) await wakeCampaignSending();
  const saved = await summaryOf(id, siteId);
  return saved ? { campaign: saved } : { error: "Campaign not found." };
}

// Takes a scheduled campaign back to a draft (only before it starts).
export async function cancelCampaignSend(
  id: string,
  siteId: string
): Promise<{ campaign: CampaignSummary } | { error: string }> {
  const { count } = await db.campaign.updateMany({
    where: { id, siteId, status: "SCHEDULED" },
    data: { status: "DRAFT", scheduledAt: null },
  });
  if (count !== 1) return { error: "It has already started sending." };
  const saved = await summaryOf(id, siteId);
  return saved ? { campaign: saved } : { error: "Campaign not found." };
}

// The mail as it will be sent, in one language — drawn from what's being
// edited (not what's saved), so the Preview follows every change.
export async function renderCampaignMailPreview(
  siteId: string,
  input: CampaignMailInput,
  language: MailLanguage
): Promise<{ html: string } | { error: string }> {
  const result = await renderCampaignMail(siteId, input, language, null);
  return "error" in result ? result : { html: result.html };
}

const TEST_LANGUAGE_NAMES: Record<MailLanguage, string> = { en: "English", fr: "French" };

// Test message (2026-10-08, Craig's choice): the mail being edited, sent
// as it stands to one address typed in, in both languages as two emails
// — from the artist's campaign address, with replies to their normal
// one. A language with no subject isn't sent (as a French subscriber
// wouldn't get it). The subject starts "[Test]". Its unsubscribe link
// and headers use the test token, which unsubscribes no one.
export async function sendCampaignTestMail(
  siteId: string,
  input: CampaignMailInput,
  to: string
): Promise<{ sent: string[]; skipped: string[] } | { error: string }> {
  const address = to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { error: "Type the address to send the test to." };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: "Email sending isn't configured yet — RESEND_API_KEY is missing in Netlify." };

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { artist: { select: { name: true, emailSlug: true } } },
  });
  if (!site) return { error: "Site not found." };
  const addresses = artistCampaignAddresses(site.artist);
  if (!addresses.ok) return { error: addresses.error };

  const resend = new Resend(apiKey);
  const sent: string[] = [];
  const skipped: string[] = [];
  for (const { value: language } of MAIL_LANGUAGES) {
    const name = TEST_LANGUAGE_NAMES[language];
    const mail = await renderCampaignMail(siteId, input, language, {
      unsubscribeUrl: unsubscribePageUrl(TEST_UNSUBSCRIBE_TOKEN),
    });
    if ("error" in mail) return mail;
    if (!mail.subject) {
      skipped.push(name);
      continue;
    }
    const { error } = await resend.emails.send({
      from: addresses.from,
      replyTo: addresses.replyTo,
      to: address,
      subject: `[Test] ${mail.subject}`,
      html: mail.html,
      headers: unsubscribeHeaders(TEST_UNSUBSCRIBE_TOKEN),
    });
    if (error) return { error: `${name}: ${error.message || "Resend could not send the email."}` };
    sent.push(name);
  }
  if (sent.length === 0) return { error: "Give the mail a subject first." };
  return { sent, skipped };
}

// Small pictures for the mail editor: each picture and artwork the
// mail uses, by pictureKey() (artworks by "artwork:<id>"), with a name.
export type MailPictureThumb = { url: string | null; label: string };

export async function describeMailPictures(
  siteId: string,
  content: MailContent
): Promise<Record<string, MailPictureThumb>> {
  const assets = await loadMailAssets(siteId, content, "");
  if (!assets) return {};
  const thumbs: Record<string, MailPictureThumb> = {};
  for (const picture of mailReferences(content).pictures) {
    const key = pictureKey(picture);
    const image = assets.pictures[key];
    const artwork = picture.kind === "artwork" ? assets.artworks[picture.id] : null;
    thumbs[key] = { url: image?.src ?? null, label: artwork?.title ?? image?.alt ?? "" };
  }
  for (const [id, artwork] of Object.entries(assets.artworks)) {
    thumbs[pictureKey({ kind: "artwork", id })] = {
      url: artwork.image?.src ?? null,
      label: artwork.title,
    };
  }
  return thumbs;
}
