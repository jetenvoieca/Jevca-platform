"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/currentUser";
import { hashPassword } from "@/lib/passwords";
import { passwordProblem } from "@/lib/passwordRules";

// A client's login (2026-10-26), set up by the admin on the Client page:
// one ARTIST login per client for now. Admin only.

export type ArtistLogin = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  lastLoginAt: string | null;
};

type Result = { ok: true } | { error: string };

export async function getArtistLogin(
  artistId: string,
): Promise<ArtistLogin | null> {
  await requireAdmin();
  const user = await db.user.findFirst({
    where: { artistId, role: "ARTIST" },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      lastLoginAt: true,
    },
  });
  return user
    ? { ...user, lastLoginAt: user.lastLoginAt?.toISOString() ?? null }
    : null;
}

// Creates the client's login, or changes its name and email — and its
// password when one is given (needed to create it). A new password logs
// them out everywhere.
export async function saveArtistLogin(
  artistId: string,
  fields: { name: string; email: string; password: string },
): Promise<Result> {
  await requireAdmin();
  const name = fields.name.trim();
  const email = fields.email.trim().toLowerCase();
  if (!name) return { error: "Enter their name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: "Enter a valid email address." };
  if (fields.password) {
    const problem = passwordProblem(fields.password);
    if (problem) return { error: problem };
  }

  const existing = await db.user.findFirst({
    where: { artistId, role: "ARTIST" },
    select: { id: true },
  });
  const clash = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (clash && clash.id !== existing?.id)
    return { error: "That email already has a login." };

  if (!existing) {
    if (!fields.password) return { error: "Choose a first password for them." };
    if (
      !(await db.artist.findUnique({
        where: { id: artistId },
        select: { id: true },
      }))
    ) {
      return { error: "Client not found." };
    }
    await db.user.create({
      data: {
        name,
        email,
        role: "ARTIST",
        artistId,
        passwordHash: await hashPassword(fields.password),
      },
    });
    return { ok: true };
  }

  await db.user.update({
    where: { id: existing.id },
    data: {
      name,
      email,
      ...(fields.password
        ? {
            passwordHash: await hashPassword(fields.password),
            sessionVersion: { increment: 1 },
            failedLogins: 0,
            lockedUntil: null,
          }
        : {}),
    },
  });
  return { ok: true };
}

// Switches the client's login on or off; off logs them out everywhere.
export async function setArtistLoginActive(
  artistId: string,
  active: boolean,
): Promise<Result> {
  await requireAdmin();
  const { count } = await db.user.updateMany({
    where: { artistId, role: "ARTIST" },
    data: active
      ? { active: true }
      : { active: false, sessionVersion: { increment: 1 } },
  });
  return count ? { ok: true } : { error: "This client has no login yet." };
}
