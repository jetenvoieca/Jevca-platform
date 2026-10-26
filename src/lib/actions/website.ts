"use server";

import * as website from "@/lib/websiteContent";
import { requireAdmin } from "@/lib/currentUser";

// The business website's editor (jetenvoieca.com), from the browser
// (2026-10-26): admin only; the work is in lib/websiteContent.ts, which
// the public website's own pages read directly.

export type { WebsitePageSummary, WebsitePageData, WebsiteHomeData, WebsiteMenuItemData } from "@/lib/websiteContent";

export async function listWebsitePages(...args: Parameters<typeof website.listWebsitePages>) {
  await requireAdmin();
  return website.listWebsitePages(...args);
}

export async function getWebsitePage(...args: Parameters<typeof website.getWebsitePage>) {
  await requireAdmin();
  return website.getWebsitePage(...args);
}

export async function getWebsitePageBySlug(...args: Parameters<typeof website.getWebsitePageBySlug>) {
  await requireAdmin();
  return website.getWebsitePageBySlug(...args);
}

export async function createWebsitePage(...args: Parameters<typeof website.createWebsitePage>) {
  await requireAdmin();
  return website.createWebsitePage(...args);
}

export async function updateWebsitePage(...args: Parameters<typeof website.updateWebsitePage>) {
  await requireAdmin();
  return website.updateWebsitePage(...args);
}

export async function deleteWebsitePage(...args: Parameters<typeof website.deleteWebsitePage>) {
  await requireAdmin();
  return website.deleteWebsitePage(...args);
}

export async function getWebsiteHome(...args: Parameters<typeof website.getWebsiteHome>) {
  await requireAdmin();
  return website.getWebsiteHome(...args);
}

export async function updateWebsiteHome(...args: Parameters<typeof website.updateWebsiteHome>) {
  await requireAdmin();
  return website.updateWebsiteHome(...args);
}

export async function requestWebsiteImageUploadUrl(...args: Parameters<typeof website.requestWebsiteImageUploadUrl>) {
  await requireAdmin();
  return website.requestWebsiteImageUploadUrl(...args);
}

export async function listWebsiteMenuItems(...args: Parameters<typeof website.listWebsiteMenuItems>) {
  await requireAdmin();
  return website.listWebsiteMenuItems(...args);
}

export async function createWebsiteMenuItem(...args: Parameters<typeof website.createWebsiteMenuItem>) {
  await requireAdmin();
  return website.createWebsiteMenuItem(...args);
}

export async function updateWebsiteMenuItem(...args: Parameters<typeof website.updateWebsiteMenuItem>) {
  await requireAdmin();
  return website.updateWebsiteMenuItem(...args);
}

export async function deleteWebsiteMenuItem(...args: Parameters<typeof website.deleteWebsiteMenuItem>) {
  await requireAdmin();
  return website.deleteWebsiteMenuItem(...args);
}

export async function reorderWebsiteMenuItems(...args: Parameters<typeof website.reorderWebsiteMenuItems>) {
  await requireAdmin();
  return website.reorderWebsiteMenuItems(...args);
}
