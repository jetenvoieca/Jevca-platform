"use server";

import { db } from "@/lib/db";
import { normalizeMenuStyle, type MenuStyleLayout } from "@/lib/menuStyleLayout";

// Menu Styles (2026-10-06) — see the note on MenuStyle in schema.prisma.
// Shared by every site, so nothing here is scoped to a site or artist.
// No revalidatePath: the Menus page refreshes itself after each change
// (router.refresh()), same as Page Styles.

export type MenuStyleSummary = { id: string; name: string; layout: MenuStyleLayout };

export type MenuStyleInput = { name: string; layout: unknown };

type Result = { ok: true } | { error: string };

// A style name must be unique (the database enforces it too).
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

// The settings are cleaned with the same rules the editor uses, so
// whatever is saved is always valid.
function validate(
  input: MenuStyleInput
): { error: string } | { data: { name: string; layout: MenuStyleLayout } } {
  const name = input.name.trim();
  if (!name) return { error: "Give the menu a name." };
  return { data: { name, layout: normalizeMenuStyle(input.layout) } };
}

// Alphabetical, so a menu is easy to find as the list grows.
export async function listMenuStyles(): Promise<MenuStyleSummary[]> {
  const rows = await db.menuStyle.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, layout: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, layout: normalizeMenuStyle(r.layout) }));
}

export async function createMenuStyle(
  input: MenuStyleInput
): Promise<{ id: string } | { error: string }> {
  const valid = validate(input);
  if ("error" in valid) return valid;
  try {
    const style = await db.menuStyle.create({ data: valid.data, select: { id: true } });
    return { id: style.id };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A menu with that name already exists." };
    throw err;
  }
}

export async function updateMenuStyle(id: string, input: MenuStyleInput): Promise<Result> {
  const valid = validate(input);
  if ("error" in valid) return valid;
  try {
    await db.menuStyle.update({ where: { id }, data: valid.data });
    return { ok: true };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A menu with that name already exists." };
    throw err;
  }
}

// A copy of the menu's settings, named "<name> (copy)" — or "(copy 2)",
// "(copy 3)"… if that's taken.
export async function duplicateMenuStyle(
  id: string
): Promise<{ id: string } | { error: string }> {
  const source = await db.menuStyle.findUnique({
    where: { id },
    select: { name: true, layout: true },
  });
  if (!source) return { error: "Menu not found." };

  let name = `${source.name} (copy)`;
  for (let n = 2; await db.menuStyle.findUnique({ where: { name }, select: { id: true } }); n++) {
    name = `${source.name} (copy ${n})`;
  }

  try {
    const style = await db.menuStyle.create({
      data: { name, layout: normalizeMenuStyle(source.layout) },
      select: { id: true },
    });
    return { id: style.id };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "Couldn't duplicate — try again." };
    throw err;
  }
}

export async function deleteMenuStyle(id: string): Promise<void> {
  await db.menuStyle.deleteMany({ where: { id } });
}
