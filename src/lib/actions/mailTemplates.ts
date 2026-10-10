"use server";

import { db } from "@/lib/db";
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
  const rows = await db.mailTemplate.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, layout: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, layout: normalizeMailTemplate(r.layout) }));
}

export async function createMailTemplate(
  input: MailTemplateInput
): Promise<{ id: string } | { error: string }> {
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
  const valid = validate(input);
  if ("error" in valid) return valid;
  try {
    await db.mailTemplate.update({ where: { id }, data: valid.data });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A template with that name already exists." };
    throw err;
  }
  await applyLookToUnsentMails(id, valid.data.layout);
  return { ok: true };
}

// Campaign mails not yet sent follow their template's look (2026-10-10,
// Craig's choice): its colours, spacing, margins and text styles are
// copied into each — their own components, content and per-component
// Text styles stay. A campaign's principal and alternative mails are
// unsent until the campaign starts sending; its follow-up until the
// follow-up starts.
async function applyLookToUnsentMails(templateId: string, template: MailTemplateLayout): Promise<void> {
  const mails = await db.campaignMail.findMany({
    where: {
      templateId,
      OR: [
        { kind: { in: ["PRINCIPAL", "ALTERNATIVE"] }, campaign: { status: { in: ["DRAFT", "SCHEDULED"] } } },
        { kind: "FOLLOW_UP", followUpStartedAt: null },
      ],
    },
    select: { id: true, layout: true },
  });
  for (const mail of mails) {
    await db.campaignMail.update({
      where: { id: mail.id },
      data: { layout: withTemplateLook(normalizeMailTemplate(mail.layout), template) },
    });
  }
}

// A copy of the template, named "<name> (copy)" — or "(copy 2)",
// "(copy 3)"… if that's taken.
export async function duplicateMailTemplate(
  id: string
): Promise<{ id: string } | { error: string }> {
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
  await db.mailTemplate.deleteMany({ where: { id } });
}
