"use server";

import { db } from "@/lib/db";
import { isPageStyleType } from "@/lib/pageStyleTypes";
import { normalizeLayout, type PageStyleLayout } from "@/lib/pageStyleLayout";

// Page Styles (2026-10-04) — see the note on PageStyle in schema.prisma.
// Shared by every site, so nothing here is scoped to a site or artist.
// No revalidatePath: the Page Styles page refreshes itself after each
// change (router.refresh()), same as the Pages page.

// A style's type and its layout travel together (PageStyleLayout), so
// the layout's shape always matches the type.
export type PageStyleSummary = { id: string; name: string } & PageStyleLayout;

export type PageStyleInput = { name: string; type: string; layout: unknown };

type Result = { ok: true } | { error: string };

// A style name must be unique (the database enforces it too).
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

// The layout is cleaned with the same rules the modal uses, so whatever
// is saved is always valid for the type.
function validate(
  input: PageStyleInput
): { error: string } | { data: { name: string } & PageStyleLayout } {
  const name = input.name.trim();
  if (!name) return { error: "Give the style a name." };
  if (!isPageStyleType(input.type)) return { error: "Choose a Style Type." };
  return { data: { name, ...normalizeLayout(input.type, input.layout) } };
}

// Alphabetical, so a style is easy to find as the list grows.
export async function listPageStyles(): Promise<PageStyleSummary[]> {
  const rows = await db.pageStyle.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, layout: true },
  });
  return rows.flatMap((r) =>
    isPageStyleType(r.type) ? [{ id: r.id, name: r.name, ...normalizeLayout(r.type, r.layout) }] : []
  );
}

export async function createPageStyle(
  input: PageStyleInput
): Promise<{ id: string } | { error: string }> {
  const valid = validate(input);
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
  const valid = validate(input);
  if ("error" in valid) return valid;
  try {
    await db.pageStyle.update({ where: { id }, data: valid.data });
    return { ok: true };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A style with that name already exists." };
    throw err;
  }
}

export async function deletePageStyle(id: string): Promise<void> {
  await db.pageStyle.deleteMany({ where: { id } });
}
