"use server";

import { requireArtistAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { defaultEmailText, isEmailTextKey, readEmailTexts, type EmailText } from "@/lib/emailTexts";

// Saving a client's email texts (2026-10-27) — Settings → Financial →
// Email texts (EmailTextsCard). See lib/emailTexts.ts.

const MAX_SUBJECT = 300;
const MAX_BODY = 5000;

// Saves one text. Saved the same as its default, it's simply the default
// again (not kept), so a later improvement to the default reaches it.
export async function saveEmailText(
  artistId: string,
  key: string,
  subjectRaw: string,
  bodyRaw: string,
): Promise<{ ok: true; text: EmailText } | { error: string }> {
  await requireArtistAccess(artistId);
  if (!isEmailTextKey(key)) return { error: "That email isn't on the list." };
  const subject = subjectRaw.trim();
  const body = bodyRaw.trim();
  if (!subject) return { error: "The subject can't be blank." };
  if (!body) return { error: "The message can't be blank." };
  if (subject.length > MAX_SUBJECT || body.length > MAX_BODY) return { error: "That's too long." };

  const artist = await db.artist.findUnique({ where: { id: artistId }, select: { emailTexts: true } });
  if (!artist) return { error: "Client not found." };
  const stored = { ...((artist.emailTexts as Record<string, EmailText> | null) ?? {}) };
  const fallback = defaultEmailText(key);
  if (subject === fallback.subject && body === fallback.body) delete stored[key];
  else stored[key] = { subject, body };
  await db.artist.update({ where: { id: artistId }, data: { emailTexts: stored } });
  return { ok: true, text: readEmailTexts(stored)[key] };
}
