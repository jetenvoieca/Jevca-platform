"use server";

import { requireUser, requireAdmin } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { isPageStyleType } from "@/lib/pageStyleTypes";
import { normalizeLayout, type PageStyleLayout } from "@/lib/pageStyleLayout";
import { normalizePresentation, type PresentationSettings } from "@/lib/presentationTemplate";

// Page Styles (2026-10-04) — see the note on PageStyle in schema.prisma.
// Shared by every site, so nothing here is scoped to a site or artist.
// No revalidatePath: the Page Styles page refreshes itself after each
// change (router.refresh()), same as the Pages page.

// A style's type and its layout travel together (PageStyleLayout), so
// the layout's shape always matches the type.
// `presentation` (2026-10-19) is how a work's details look when opened
// on these pages: its Presentation Template's settings, or the built-in
// look when it has none.
export type PageStyleSummary = {
  id: string;
  name: string;
  presentationTemplateId: string | null;
  presentation: PresentationSettings;
} & PageStyleLayout;

export type PageStyleInput = {
  name: string;
  type: string;
  layout: unknown;
  presentationTemplateId: string | null;
};

type Result = { ok: true } | { error: string };

// A style name must be unique (the database enforces it too).
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

// The layout is cleaned with the same rules the editor uses, so whatever
// is saved is always valid for the type.
async function validate(
  input: PageStyleInput
): Promise<{ error: string } | { data: { name: string; presentationTemplateId: string | null } & PageStyleLayout }> {
  const name = input.name.trim();
  if (!name) return { error: "Give the style a name." };
  if (!isPageStyleType(input.type)) return { error: "Choose a Style Type." };
  const templateId = input.presentationTemplateId || null;
  if (templateId && !(await db.presentationTemplate.findUnique({ where: { id: templateId }, select: { id: true } }))) {
    return { error: "That Presentation template no longer exists." };
  }
  return { data: { name, presentationTemplateId: templateId, ...normalizeLayout(input.type, input.layout) } };
}

// Alphabetical, so a style is easy to find as the list grows.
export async function listPageStyles(): Promise<PageStyleSummary[]> {
  await requireUser();
  const rows = await db.pageStyle.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      layout: true,
      presentationTemplateId: true,
      presentationTemplate: { select: { settings: true } },
    },
  });
  return rows.flatMap((r) =>
    isPageStyleType(r.type)
      ? [
          {
            id: r.id,
            name: r.name,
            presentationTemplateId: r.presentationTemplateId,
            presentation: normalizePresentation(r.presentationTemplate?.settings),
            ...normalizeLayout(r.type, r.layout),
          },
        ]
      : []
  );
}

export async function createPageStyle(
  input: PageStyleInput
): Promise<{ id: string } | { error: string }> {
  await requireAdmin();
  const valid = await validate(input);
  if ("error" in valid) return valid;
  try {
    const style = await db.pageStyle.create({ data: valid.data, select: { id: true } });
    return { id: style.id };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A style with that name already exists." };
    throw err;
  }
}

export async function updatePageStyle(id: string, input: PageStyleInput): Promise<Result> {
  await requireAdmin();
  const valid = await validate(input);
  if ("error" in valid) return valid;
  try {
    await db.pageStyle.update({ where: { id }, data: valid.data });
    return { ok: true };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A style with that name already exists." };
    throw err;
  }
}

// Duplicate (2026-10-05): a copy of the style's type and layout, named
// "<name> (copy)" — or "(copy 2)", "(copy 3)"… if that's taken. Pages
// using the original are not moved to the copy.
export async function duplicatePageStyle(
  id: string
): Promise<{ id: string } | { error: string }> {
  await requireAdmin();
  const source = await db.pageStyle.findUnique({
    where: { id },
    select: { name: true, type: true, layout: true, presentationTemplateId: true },
  });
  if (!source || !isPageStyleType(source.type)) return { error: "Style not found." };

  let name = `${source.name} (copy)`;
  for (let n = 2; await db.pageStyle.findUnique({ where: { name }, select: { id: true } }); n++) {
    name = `${source.name} (copy ${n})`;
  }

  try {
    const style = await db.pageStyle.create({
      data: {
        name,
        presentationTemplateId: source.presentationTemplateId,
        ...normalizeLayout(source.type, source.layout),
      },
      select: { id: true },
    });
    return { id: style.id };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "Couldn't duplicate — try again." };
    throw err;
  }
}

export async function deletePageStyle(id: string): Promise<void> {
  await requireAdmin();
  await db.pageStyle.deleteMany({ where: { id } });
}
