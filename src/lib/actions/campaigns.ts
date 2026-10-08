"use server";

import { db } from "@/lib/db";
import { normalizeMailTemplate, type MailTemplateLayout } from "@/lib/mailTemplateLayout";
import {
  cleanMailContent,
  mailReferences,
  pictureKey,
  type Localized,
  type MailContent,
  type MailLanguage,
} from "@/lib/mailContent";
import { loadMailAssets } from "@/lib/mailAssets";
import { renderMailHtml } from "@/lib/mailHtml";

// Marketing → Mail Campaigns (2026-10-08, step 3) — see Campaign and
// CampaignMail in schema.prisma. Every action is scoped by the site the
// page belongs to. No revalidatePath: the page keeps its own list up to
// date.

export type CampaignMailData = {
  id: string;
  kind: "PRINCIPAL";
  layout: MailTemplateLayout;
  content: MailContent;
  subject: Localized<string>;
  preview: Localized<string>;
};

export type CampaignSummary = { id: string; name: string; mails: CampaignMailData[] };

// What the mail editor saves.
export type CampaignMailInput = {
  layout: unknown;
  content: unknown;
  subject: Localized<string>;
  preview: Localized<string>;
};

type Result = { ok: true } | { error: string };

const MAX_SUBJECT = 200;

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

function cleanSubjectLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const line = value.replace(/\s+/g, " ").trim().slice(0, MAX_SUBJECT);
  return line || null;
}

const MAIL_SELECT = {
  id: true,
  kind: true,
  layout: true,
  content: true,
  subjectEn: true,
  subjectFr: true,
  previewEn: true,
  previewFr: true,
} as const;

function toMailData(row: {
  id: string;
  kind: "PRINCIPAL";
  layout: unknown;
  content: unknown;
  subjectEn: string | null;
  subjectFr: string | null;
  previewEn: string | null;
  previewFr: string | null;
}): CampaignMailData {
  const layout = normalizeMailTemplate(row.layout);
  return {
    id: row.id,
    kind: row.kind,
    layout,
    content: cleanMailContent(row.content, layout),
    subject: { en: row.subjectEn ?? "", fr: row.subjectFr ?? "" },
    preview: { en: row.previewEn ?? "", fr: row.previewFr ?? "" },
  };
}

// Newest first, as campaigns are made one after another.
export async function listCampaigns(siteId: string): Promise<CampaignSummary[]> {
  const rows = await db.campaign.findMany({
    where: { siteId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      mails: { orderBy: { createdAt: "asc" }, select: MAIL_SELECT },
    },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, mails: r.mails.map(toMailData) }));
}

// A new campaign, with its principal mail started from a copy of the
// chosen Mail Template.
export async function createCampaign(
  siteId: string,
  input: { name: string; templateId: string }
): Promise<{ campaign: CampaignSummary } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Give the campaign a name." };
  const template = await db.mailTemplate.findUnique({
    where: { id: input.templateId },
    select: { layout: true },
  });
  if (!template) return { error: "Choose a mail template." };
  const layout = normalizeMailTemplate(template.layout);

  try {
    const campaign = await db.campaign.create({
      data: { siteId, name, mails: { create: { kind: "PRINCIPAL", layout, content: {} } } },
      select: { id: true, name: true, mails: { select: MAIL_SELECT } },
    });
    return { campaign: { ...campaign, mails: campaign.mails.map(toMailData) } };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A campaign with that name already exists." };
    throw err;
  }
}

export async function renameCampaign(id: string, siteId: string, name: string): Promise<Result> {
  const clean = name.trim();
  if (!clean) return { error: "Give the campaign a name." };
  try {
    const { count } = await db.campaign.updateMany({ where: { id, siteId }, data: { name: clean } });
    return count === 1 ? { ok: true } : { error: "Campaign not found." };
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
    select: { name: true, mails: { orderBy: { createdAt: "asc" }, select: MAIL_SELECT } },
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
        mails: {
          create: source.mails.map((m) => ({
            kind: m.kind,
            layout: m.layout ?? {},
            content: m.content ?? {},
            subjectEn: m.subjectEn,
            subjectFr: m.subjectFr,
            previewEn: m.previewEn,
            previewFr: m.previewFr,
          })),
        },
      },
      select: { id: true, name: true, mails: { orderBy: { createdAt: "asc" }, select: MAIL_SELECT } },
    });
    return { campaign: { ...campaign, mails: campaign.mails.map(toMailData) } };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "Couldn't duplicate — try again." };
    throw err;
  }
}

export async function deleteCampaign(id: string, siteId: string): Promise<void> {
  await db.campaign.deleteMany({ where: { id, siteId } });
}

// Saves a mail's layout, content, subject and preview text — each
// cleaned with the same rules the editor uses, so whatever is saved is
// always valid. Content for removed components is dropped.
export async function updateCampaignMail(
  mailId: string,
  siteId: string,
  input: CampaignMailInput
): Promise<Result> {
  const layout = normalizeMailTemplate(input.layout);
  const { count } = await db.campaignMail.updateMany({
    where: { id: mailId, campaign: { siteId } },
    data: {
      layout,
      content: cleanMailContent(input.content, layout),
      subjectEn: cleanSubjectLine(input.subject?.en),
      subjectFr: cleanSubjectLine(input.subject?.fr),
      previewEn: cleanSubjectLine(input.preview?.en),
      previewFr: cleanSubjectLine(input.preview?.fr),
    },
  });
  return count === 1 ? { ok: true } : { error: "Mail not found." };
}

// The mail as it will be sent, in one language — drawn from what's being
// edited (not what's saved), so the Preview follows every change.
export async function renderCampaignMailPreview(
  siteId: string,
  input: CampaignMailInput,
  language: MailLanguage
): Promise<{ html: string } | { error: string }> {
  const layout = normalizeMailTemplate(input.layout);
  const content = cleanMailContent(input.content, layout);
  const assets = await loadMailAssets(siteId, content, "");
  if (!assets) return { error: "Site not found." };
  return {
    html: renderMailHtml({
      layout,
      content,
      language,
      subject: cleanSubjectLine(input.subject?.[language]) ?? "",
      preview: cleanSubjectLine(input.preview?.[language]) ?? "",
      assets,
      // The real unsubscribe page comes with sending.
      unsubscribeUrl: "#",
    }),
  };
}

// Small pictures for the Content panel: each picture and artwork the
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
