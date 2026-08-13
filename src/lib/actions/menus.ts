"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function listMenus(siteId: string) {
  return db.menu.findMany({
    where: { siteId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getMenu(menuId: string) {
  return db.menu.findUnique({
    where: { id: menuId },
    relationLoadStrategy: "query",
    include: {
      groups: {
        orderBy: { position: "asc" },
        include: {
          items: {
            orderBy: { position: "asc" },
            include: { page: { select: { id: true, title: true } } },
          },
        },
      },
    },
  });
}

export async function getSitePages(siteId: string) {
  return db.page.findMany({
    where: { siteId },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
}

// "+ New Menu" — the first menu created for a site becomes active
// automatically (a site with saved menus but none active would have
// nothing for a future public renderer to use).
export async function createMenu(siteId: string, formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;

  const existingCount = await db.menu.count({ where: { siteId } });

  const menu = await db.menu.create({
    data: { siteId, name, isActive: existingCount === 0 },
  });

  revalidatePath(`/sites/${siteId}/menus`);
  redirect(`/sites/${siteId}/menus/${menu.id}`);
}

export async function renameMenu(menuId: string, formData: FormData): Promise<void> {
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;
  const menu = await db.menu.update({ where: { id: menuId }, data: { name } });
  revalidatePath(`/sites/${menu.siteId}/menus`);
}

// Switching the active menu is deliberately a single action — unset every
// other menu on the site, then set this one, in one transaction.
export async function setActiveMenu(siteId: string, menuId: string) {
  await db.$transaction([
    db.menu.updateMany({ where: { siteId }, data: { isActive: false } }),
    db.menu.update({ where: { id: menuId }, data: { isActive: true } }),
  ]);
  revalidatePath(`/sites/${siteId}/menus`);
}

export async function deleteMenu(siteId: string, menuId: string) {
  await db.menu.delete({ where: { id: menuId } });
  revalidatePath(`/sites/${siteId}/menus`);
  redirect(`/sites/${siteId}/menus`);
}

export async function addGroup(menuId: string, formData: FormData): Promise<void> {
  const name = (formData.get("name") as string)?.trim() || "New Group";
  const max = await db.menuGroup.aggregate({ where: { menuId }, _max: { position: true } });
  const menu = await db.menuGroup.create({
    data: { menuId, name, position: (max._max.position ?? -1) + 1 },
    include: { menu: true },
  });
  revalidatePath(`/sites/${menu.menu.siteId}/menus/${menuId}`);
}

export async function updateGroupName(groupId: string, formData: FormData): Promise<void> {
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;
  const group = await db.menuGroup.update({
    where: { id: groupId },
    data: { name },
    include: { menu: true },
  });
  revalidatePath(`/sites/${group.menu.siteId}/menus/${group.menuId}`);
}

export async function deleteGroup(groupId: string) {
  const group = await db.menuGroup.delete({
    where: { id: groupId },
    include: { menu: true },
  });
  revalidatePath(`/sites/${group.menu.siteId}/menus/${group.menuId}`);
}

export async function moveGroup(groupId: string, direction: -1 | 1) {
  const group = await db.menuGroup.findUnique({ where: { id: groupId } });
  if (!group) return;
  const neighbor = await db.menuGroup.findFirst({
    where: {
      menuId: group.menuId,
      position: direction === -1 ? { lt: group.position } : { gt: group.position },
    },
    orderBy: { position: direction === -1 ? "desc" : "asc" },
  });
  if (!neighbor) return;
  await db.$transaction([
    db.menuGroup.update({ where: { id: group.id }, data: { position: neighbor.position } }),
    db.menuGroup.update({ where: { id: neighbor.id }, data: { position: group.position } }),
  ]);
  const menu = await db.menu.findUnique({ where: { id: group.menuId } });
  if (menu) revalidatePath(`/sites/${menu.siteId}/menus/${menu.id}`);
}

// "+ Add Item" — picks an existing Page; label starts as that Page's title
// but is independent from that point on (per the design: renaming the item
// never touches the page, and vice versa). The same Page can be added more
// than once, in this or any other group.
export async function addMenuItem(groupId: string, pageId: string) {
  const page = await db.page.findUnique({ where: { id: pageId } });
  if (!page) return;
  const max = await db.menuItem.aggregate({ where: { groupId }, _max: { position: true } });
  const item = await db.menuItem.create({
    data: {
      groupId,
      pageId,
      label: page.title,
      position: (max._max.position ?? -1) + 1,
    },
    include: { group: { include: { menu: true } } },
  });
  revalidatePath(`/sites/${item.group.menu.siteId}/menus/${item.group.menuId}`);
}

export async function updateMenuItem(itemId: string, formData: FormData): Promise<void> {
  const label = (formData.get("label") as string)?.trim();
  const byline = (formData.get("byline") as string)?.trim() || null;
  if (!label) return;
  const item = await db.menuItem.update({
    where: { id: itemId },
    data: { label, byline },
    include: { group: { include: { menu: true } } },
  });
  revalidatePath(`/sites/${item.group.menu.siteId}/menus/${item.group.menuId}`);
}

export async function removeMenuItem(itemId: string) {
  const item = await db.menuItem.delete({
    where: { id: itemId },
    include: { group: { include: { menu: true } } },
  });
  revalidatePath(`/sites/${item.group.menu.siteId}/menus/${item.group.menuId}`);
}

export async function moveMenuItem(itemId: string, direction: -1 | 1) {
  const item = await db.menuItem.findUnique({ where: { id: itemId } });
  if (!item) return;
  const neighbor = await db.menuItem.findFirst({
    where: {
      groupId: item.groupId,
      position: direction === -1 ? { lt: item.position } : { gt: item.position },
    },
    orderBy: { position: direction === -1 ? "desc" : "asc" },
  });
  if (!neighbor) return;
  await db.$transaction([
    db.menuItem.update({ where: { id: item.id }, data: { position: neighbor.position } }),
    db.menuItem.update({ where: { id: neighbor.id }, data: { position: item.position } }),
  ]);
  const group = await db.menuGroup.findUnique({
    where: { id: item.groupId },
    include: { menu: true },
    relationLoadStrategy: "query",
  });
  if (group) revalidatePath(`/sites/${group.menu.siteId}/menus/${group.menuId}`);
}
