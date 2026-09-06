"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type PageStyleValue =
  | "PORTFOLIO"
  | "SHOWCASE"
  | "PROFILE"
  | "EXHIBITIONS"
  | "HOME"
  | "FREEFORM";

// ---- Reading data for the Templates directory ----

export async function getTemplatesForDirectory(q: string) {
  const templates = await db.template.findMany({
    where: q
      ? { name: { contains: q, mode: "insensitive" } }
      : undefined,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      updatedAt: true,
      _count: { select: { pages: true } },
    },
  });

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    pageCount: t._count.pages,
    updatedAt: t.updatedAt.toISOString(),
  }));
}

export async function getTemplate(id: string) {
  const template = await db.template.findUnique({
    where: { id },
    include: {
      pages: { orderBy: { position: "asc" } },
    },
  });
  if (!template) return null;

  return {
    id: template.id,
    name: template.name,
    pages: template.pages.map((p) => ({
      id: p.id,
      name: p.name,
      style: p.style as PageStyleValue,
      position: p.position,
    })),
  };
}

// ---- Create a new Template ----

export type CreateTemplateState = { error?: string };

export async function createTemplate(
  _prevState: CreateTemplateState,
  formData: FormData
): Promise<CreateTemplateState> {
  const name = (formData.get("name") as string)?.trim();
  if (!name) {
    return { error: "Template name is required." };
  }

  const template = await db.template.create({ data: { name } });

  revalidatePath("/templates");
  redirect(`/templates/${template.id}`);
}

// ---- Rename a Template ----

export async function updateTemplateName(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;

  await db.template.update({ where: { id }, data: { name: trimmed } });
  revalidatePath("/templates");
  revalidatePath(`/templates/${id}`);
}

// ---- Add a page ("+ Add new menu item") to a Template ----

export type AddTemplatePageState = { error?: string };

export async function addTemplatePage(
  templateId: string,
  _prevState: AddTemplatePageState,
  formData: FormData
): Promise<AddTemplatePageState> {
  const name = (formData.get("name") as string)?.trim();
  const style = (formData.get("style") as string) as PageStyleValue;

  if (!name) {
    return { error: "Page name is required." };
  }
  const validStyles: PageStyleValue[] = [
    "PORTFOLIO",
    "SHOWCASE",
    "PROFILE",
    "EXHIBITIONS",
    "HOME",
    "FREEFORM",
  ];
  if (!validStyles.includes(style)) {
    return { error: "Choose a page style." };
  }

  const highestPosition = await db.templatePage.aggregate({
    where: { templateId },
    _max: { position: true },
  });

  await db.templatePage.create({
    data: {
      templateId,
      name,
      style,
      position: (highestPosition._max.position ?? -1) + 1,
    },
  });

  revalidatePath(`/templates/${templateId}`);
  return {};
}

// ---- Remove a page from a Template ----

export async function deleteTemplatePage(id: string, templateId: string): Promise<void> {
  await db.templatePage.delete({ where: { id } });
  revalidatePath(`/templates/${templateId}`);
}
