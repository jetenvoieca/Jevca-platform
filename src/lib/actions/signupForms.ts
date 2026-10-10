"use server";

import { db } from "@/lib/db";
import { normalizeLayout } from "@/lib/pageStyleLayout";
import {
  cleanSignupWording,
  defaultSignupWording,
  type SignupFormContent,
  type SignupFormSetup,
  type SignupWording,
} from "@/lib/signupForms";
import type { MailListSummary } from "@/lib/actions/subscribers";

// Setting up a page's sign-up forms in Arrange (2026-10-10) — see
// lib/signupForms.ts and PageSignupForm in schema.prisma. Scoped by
// siteId; the list must be one of the site's artist's own.

type Result = { ok: true } | { error: string };

// The page's forms, as the page draws them — for the admin preview and
// for publishing.
export async function getPageSignupForms(siteId: string, pageId: string): Promise<SignupFormContent[]> {
  const rows = await db.pageSignupForm.findMany({
    where: { pageId, page: { siteId } },
    select: { blockId: true, placeholder: true, buttonLabel: true, consentText: true, thanksText: true },
  });
  return rows;
}

// What the set-up window needs: the form as saved (null = not set up
// yet), the wording a new one starts with, and the artist's lists.
export async function getSignupFormSetup(
  siteId: string,
  pageId: string,
  blockId: string
): Promise<{ setup: SignupFormSetup | null; defaults: SignupWording; lists: MailListSummary[] } | null> {
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { artistId: true, artist: { select: { name: true } } },
  });
  if (!site) return null;
  const [form, lists] = await Promise.all([
    db.pageSignupForm.findFirst({
      where: { pageId, blockId, page: { siteId } },
      select: { listId: true, placeholder: true, buttonLabel: true, consentText: true, thanksText: true },
    }),
    db.mailList.findMany({
      where: { artistId: site.artistId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return { setup: form, defaults: defaultSignupWording(site.artist.name), lists };
}

// Saves a form's list and wording. The component must be a Sign-up form
// in the page's Display Style.
export async function saveSignupForm(
  siteId: string,
  pageId: string,
  blockId: string,
  input: SignupFormSetup
): Promise<Result> {
  const page = await db.page.findFirst({
    where: { id: pageId, siteId },
    select: { site: { select: { artistId: true } }, pageStyle: { select: { type: true, layout: true } } },
  });
  if (!page) return { error: "Page not found." };
  if (page.pageStyle?.type !== "BLOCK_BUILD") {
    return { error: "Only pages with a Block Build Display Style have sign-up forms." };
  }
  const style = normalizeLayout("BLOCK_BUILD", page.pageStyle.layout);
  if (style.type !== "BLOCK_BUILD" || !style.layout.blocks.some((b) => b.id === blockId && b.type === "signup")) {
    return { error: "That sign-up form is no longer in the page's Display Style." };
  }

  if (!input.listId) return { error: "Choose the mail list sign-ups join." };
  const list = await db.mailList.findFirst({
    where: { id: input.listId, artistId: page.site.artistId },
    select: { id: true },
  });
  if (!list) return { error: "That mail list no longer exists." };

  const wording = cleanSignupWording(input);
  if ("error" in wording) return wording;

  await db.pageSignupForm.upsert({
    where: { pageId_blockId: { pageId, blockId } },
    create: { pageId, blockId, listId: list.id, ...wording },
    update: { listId: list.id, ...wording },
  });
  return { ok: true };
}

// Removes a form's set-up, so the page shows nothing there.
export async function clearSignupForm(siteId: string, pageId: string, blockId: string): Promise<Result> {
  await db.pageSignupForm.deleteMany({ where: { pageId, blockId, page: { siteId } } });
  return { ok: true };
}
