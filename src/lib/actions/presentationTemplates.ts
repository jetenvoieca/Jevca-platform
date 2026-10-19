"use server";

import { db } from "@/lib/db";
import { normalizePresentation, type PresentationSettings } from "@/lib/presentationTemplate";

// Presentation Templates (2026-10-19) — see the note on
// PresentationTemplate in schema.prisma. Shared by every site, so nothing
// here is scoped to a site or artist. No revalidatePath: the
// Presentations page refreshes itself after each change, like Menus.

export type PresentationTemplateSummary = { id: string; name: string; settings: PresentationSettings };

export type PresentationTemplateInput = { name: string; settings: unknown };

type Result = { ok: true } | { error: string };

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

// The settings are cleaned with the same rules the editor uses.
function validate(
  input: PresentationTemplateInput
): { error: string } | { data: { name: string; settings: PresentationSettings } } {
  const name = input.name.trim();
  if (!name) return { error: "Give the template a name." };
  return { data: { name, settings: normalizePresentation(input.settings) } };
}

// Alphabetical, so a template is easy to find as the list grows.
export async function listPresentationTemplates(): Promise<PresentationTemplateSummary[]> {
  const rows = await db.presentationTemplate.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, settings: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, settings: normalizePresentation(r.settings) }));
}

export async function createPresentationTemplate(
  input: PresentationTemplateInput
): Promise<{ id: string } | { error: string }> {
  const valid = validate(input);
  if ("error" in valid) return valid;
  try {
    const template = await db.presentationTemplate.create({ data: valid.data, select: { id: true } });
    return { id: template.id };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A template with that name already exists." };
    throw err;
  }
}

export async function updatePresentationTemplate(id: string, input: PresentationTemplateInput): Promise<Result> {
  const valid = validate(input);
  if ("error" in valid) return valid;
  try {
    await db.presentationTemplate.update({ where: { id }, data: valid.data });
    return { ok: true };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A template with that name already exists." };
    throw err;
  }
}

// A copy of the template's settings, named "<name> (copy)" — or
// "(copy 2)"… if that's taken. For trying a variation.
export async function duplicatePresentationTemplate(id: string): Promise<{ id: string } | { error: string }> {
  const source = await db.presentationTemplate.findUnique({ where: { id }, select: { name: true, settings: true } });
  if (!source) return { error: "Template not found." };

  let name = `${source.name} (copy)`;
  for (let n = 2; await db.presentationTemplate.findUnique({ where: { name }, select: { id: true } }); n++) {
    name = `${source.name} (copy ${n})`;
  }
  try {
    const template = await db.presentationTemplate.create({
      data: { name, settings: normalizePresentation(source.settings) },
      select: { id: true },
    });
    return { id: template.id };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "Couldn't duplicate — try again." };
    throw err;
  }
}

// Page Styles using it go back to the built-in look.
export async function deletePresentationTemplate(id: string): Promise<void> {
  await db.presentationTemplate.deleteMany({ where: { id } });
}
