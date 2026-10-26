"use server";

import { requireUser, requireAdmin } from "@/lib/currentUser";
import { db } from "@/lib/db";
import type { CampaignMailKind, CampaignStatus } from "@/generated/prisma/client";
import { campaignMailLabel } from "@/lib/campaignMails";
import { cleanMailContent, followTemplate } from "@/lib/mailContent";
import { normalizeMailTemplate, withTemplateLook, type MailTemplateLayout } from "@/lib/mailTemplateLayout";

// Mail Templates (2026-10-08) — see the note on MailTemplate in
// schema.prisma. Shared by every site, so nothing here is scoped to a
// site or artist, same as Page Styles. No revalidatePath: the Mail
// Templates page refreshes itself after each change (router.refresh()).

export type MailTemplateSummary = { id: string; name: string; layout: MailTemplateLayout };

export type MailTemplateInput = { name: string; layout: unknown };

type Result = { ok: true } | { error: string };

// A template name must be unique (the database enforces it too).
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

// The layout is cleaned with the same rules the editor uses, so whatever
// is saved is always valid.
function validate(
  input: MailTemplateInput
): { error: string } | { data: { name: string; layout: MailTemplateLayout } } {
  const name = input.name.trim();
  if (!name) return { error: "Give the template a name." };
  return { data: { name, layout: normalizeMailTemplate(input.layout) } };
}

// Alphabetical, so a template is easy to find as the list grows.
export async function listMailTemplates(): Promise<MailTemplateSummary[]> {
  await requireUser();
  const rows = await db.mailTemplate.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, layout: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, layout: normalizeMailTemplate(r.layout) }));
}

export async function createMailTemplate(
  input: MailTemplateInput
): Promise<{ id: string } | { error: string }> {
  await requireAdmin();
  const valid = validate(input);
  if ("error" in valid) return valid;
  try {
    const template = await db.mailTemplate.create({ data: valid.data, select: { id: true } });
    return { id: template.id };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A template with that name already exists." };
    throw err;
  }
}

export async function updateMailTemplate(id: string, input: MailTemplateInput): Promise<Result> {
  await requireAdmin();
  const valid = validate(input);
  if ("error" in valid) return valid;
  try {
    await db.mailTemplate.update({ where: { id }, data: valid.data });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A template with that name already exists." };
    throw err;
  }
  await applyTemplateToUnsentMails(id, valid.data.layout, false);
  return { ok: true };
}

// Campaign mails not yet sent follow their template (Craig's choices:
// its look, 2026-10-10; its components and arrangement too, 2026-10-13)
// — see followTemplate in lib/mailContent.ts. A campaign's principal and
// alternative mails are unsent until the campaign starts sending; its
// follow-up until the follow-up starts.
//
// Saving the template (it saves itself while being edited) updates every
// mail that loses nothing. A mail whose content would have no place in
// the template is "held": it takes the template's look only, and is
// listed when the editor is closed (syncTemplateMails), so it can be updated
// anyway (applyTemplateToHeldMails) or left as it is.

const UNSENT = {
  OR: [
    { kind: { in: ["PRINCIPAL", "ALTERNATIVE"] as CampaignMailKind[] }, campaign: { status: { in: ["DRAFT", "SCHEDULED"] as CampaignStatus[] } } },
    { kind: "FOLLOW_UP" as CampaignMailKind, followUpStartedAt: null },
  ],
};

// A mail held back from following its template, and what it would lose.
export type HeldMail = { campaign: string; mail: string; dropped: string[] };

async function unsentMails(templateId: string) {
  const rows = await db.campaignMail.findMany({
    where: { templateId, ...UNSENT },
    select: { id: true, kind: true, position: true, layout: true, content: true, campaign: { select: { name: true } } },
    orderBy: [{ campaign: { name: "asc" } }, { position: "asc" }],
  });
  return rows.map((r) => {
    const layout = normalizeMailTemplate(r.layout);
    return { ...r, layout, content: cleanMailContent(r.content, layout) };
  });
}

// Brings the unsent mails into line; returns those held back.
async function applyTemplateToUnsentMails(
  templateId: string,
  template: MailTemplateLayout,
  force: boolean
): Promise<HeldMail[]> {
  const held: HeldMail[] = [];
  for (const mail of await unsentMails(templateId)) {
    const followed = followTemplate(mail.layout, mail.content, template);
    const follows = followed.dropped.length === 0 || force;
    if (!follows) {
      held.push({ campaign: mail.campaign.name, mail: campaignMailLabel(mail.kind, mail.position), dropped: followed.dropped });
    }
    await db.campaignMail.update({
      where: { id: mail.id },
      data: follows
        ? { layout: followed.layout, content: followed.content }
        : { layout: withTemplateLook(mail.layout, template) },
    });
  }
  return held;
}

// When the editor is closed: brings the unsent mails into line (also
// any made before 2026-10-13, when only the look followed) and returns
// those held back, for the warning.
export async function syncTemplateMails(templateId: string): Promise<HeldMail[]> {
  await requireAdmin();
  const row = await db.mailTemplate.findUnique({ where: { id: templateId }, select: { layout: true } });
  if (!row) return [];
  return applyTemplateToUnsentMails(templateId, normalizeMailTemplate(row.layout), false);
}

// "Update them anyway": the held mails follow the template, losing the
// content that has no place in it.
export async function applyTemplateToHeldMails(templateId: string): Promise<void> {
  await requireAdmin();
  const row = await db.mailTemplate.findUnique({ where: { id: templateId }, select: { layout: true } });
  if (!row) return;
  await applyTemplateToUnsentMails(templateId, normalizeMailTemplate(row.layout), true);
}

// A copy of the template, named "<name> (copy)" — or "(copy 2)",
// "(copy 3)"… if that's taken.
export async function duplicateMailTemplate(
  id: string
): Promise<{ id: string } | { error: string }> {
  await requireAdmin();
  const source = await db.mailTemplate.findUnique({
    where: { id },
    select: { name: true, layout: true },
  });
  if (!source) return { error: "Template not found." };

  let name = `${source.name} (copy)`;
  for (let n = 2; await db.mailTemplate.findUnique({ where: { name }, select: { id: true } }); n++) {
    name = `${source.name} (copy ${n})`;
  }

  try {
    const template = await db.mailTemplate.create({
      data: { name, layout: normalizeMailTemplate(source.layout) },
      select: { id: true },
    });
    return { id: template.id };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "Couldn't duplicate — try again." };
    throw err;
  }
}

export async function deleteMailTemplate(id: string): Promise<void> {
  await requireAdmin();
  await db.mailTemplate.deleteMany({ where: { id } });
}
