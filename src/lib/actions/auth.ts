"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";
import { createHash, randomBytes } from "node:crypto";
import { Resend } from "resend";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { APP_URL } from "@/lib/appUrl";
import { passwordProblem } from "@/lib/passwordRules";
import { getCurrentUser } from "@/lib/currentUser";

// Logging in and out (2026-10-26: by email and password, one login per
// person — see User in schema.prisma).

export type LoginState = { error?: string };

// After this many wrong passwords in a row a login is locked for
// LOCK_MINUTES.
const LOGIN_LOCK_AFTER = 10;
const LOCK_MINUTES = 15;

const safeNext = (next: string) =>
  next.startsWith("/") && !next.startsWith("//") ? next : "/";

async function startSession(user: {
  id: string;
  sessionVersion: number;
  role: "ADMIN" | "ARTIST";
}) {
  const token = await createSessionToken({
    userId: user.id,
    version: user.sessionVersion,
    role: user.role,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

// Signature matches React's useActionState — called from LoginForm.
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const password = (formData.get("password") as string) || "";
  const next = (formData.get("next") as string) || "/";
  const wrong = { error: "That email and password don't match." };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active) return wrong;
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: "Too many wrong passwords — try again in a few minutes." };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data:
        failed >= LOGIN_LOCK_AFTER
          ? {
              failedLogins: 0,
              lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000),
            }
          : { failedLogins: failed },
    });
    return wrong;
  }
  await db.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await startSession(user);
  redirect(safeNext(next));
}

// The first admin account (2026-10-26): only while there is none, and
// only with the old shared password (APP_PASSWORD), so nobody else can
// claim it. From then on the shared password opens nothing.
export async function setUpAdmin(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const shared = (formData.get("shared") as string) || "";
  const name = ((formData.get("name") as string) || "").trim();
  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const password = (formData.get("password") as string) || "";
  const again = (formData.get("again") as string) || "";

  if ((await db.user.count({ where: { role: "ADMIN" } })) > 0) {
    return { error: "The admin account is already set up — log in with it." };
  }
  const expected = process.env.APP_PASSWORD;
  if (!expected || shared !== expected)
    return { error: "That isn't the current shared password." };
  if (!name) return { error: "Enter your name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: "Enter a valid email address." };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== again)
    return { error: "The two new passwords don't match." };

  const user = await db.user.create({
    data: {
      name,
      email,
      role: "ADMIN",
      passwordHash: await hashPassword(password),
      lastLoginAt: new Date(),
    },
  });
  await startSession(user);
  redirect("/");
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

// The person logged in changes their own password (2026-10-26). Every
// other place they're logged in is logged out; this one stays in.
export async function changeOwnPassword(
  _prev: LoginState & { done?: boolean },
  formData: FormData,
) {
  const me = await getCurrentUser();
  if (!me) return { error: "Log in again first." };
  const current = (formData.get("current") as string) || "";
  const password = (formData.get("password") as string) || "";
  const again = (formData.get("again") as string) || "";

  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await verifyPassword(current, user.passwordHash)))
    return { error: "Your current password isn't right." };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== again)
    return { error: "The two new passwords don't match." };

  const updated = await db.user.update({
    where: { id: me.id },
    data: {
      passwordHash: await hashPassword(password),
      sessionVersion: { increment: 1 },
    },
  });
  await startSession(updated);
  return { done: true };
}

// ---- "Forgot your password?" (2026-11-10) ----
// Public, like logging in. Asking always gives the same answer, whether
// or not the email has a login, so it can't be used to find out who has
// one. The link is emailed, works once and lasts an hour; using it sets
// the new password, unlocks the login, logs it out everywhere else and
// logs it in here.

const RESET_MINUTES = 60;
// Links that may be waiting for one login at once — stops the form being
// used to flood someone's inbox.
const RESET_MAX_WAITING = 3;

const hashResetToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type ResetRequestState = { sent?: boolean; error?: string };

export async function requestPasswordReset(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };

  const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true, active: true } });
  if (!user || !user.active) return { sent: true };
  const waiting = await db.passwordReset.count({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (waiting >= RESET_MAX_WAITING) return { sent: true };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Password reset not sent — RESEND_API_KEY is missing.");
    return { error: "Email can't be sent just now — please try again later." };
  }
  const token = randomBytes(32).toString("base64url");
  await db.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: hashResetToken(token),
      expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000),
    },
  });
  const { businessEmailAddress } = await db.platformSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
    select: { businessEmailAddress: true },
  });
  const { error } = await new Resend(apiKey).emails.send({
    from: `JEVCA Studio <${businessEmailAddress}>`,
    to: email,
    subject: "Choose a new password",
    text: [
      `Hello ${user.name},`,
      "",
      "Someone asked to choose a new password for your JEVCA Studio login. If it was you, open this link within the hour:",
      "",
      `${APP_URL}/login/reset/${token}`,
      "",
      "If it wasn't you, ignore this email — your password stays as it is.",
    ].join("\n"),
  });
  if (error) {
    console.error(`Password reset email to ${email} failed: ${error.message}`);
    return { error: "Email can't be sent just now — please try again later." };
  }
  return { sent: true };
}

// Whether a reset link can still be used (for its page).
export async function isPasswordResetUsable(token: string): Promise<boolean> {
  const reset = await db.passwordReset.findUnique({
    where: { tokenHash: hashResetToken(token) },
    select: { usedAt: true, expiresAt: true },
  });
  return !!reset && !reset.usedAt && reset.expiresAt > new Date();
}

export async function resetPassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const token = (formData.get("token") as string) || "";
  const password = (formData.get("password") as string) || "";
  const again = (formData.get("again") as string) || "";
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== again) return { error: "The two new passwords don't match." };

  const tokenHash = hashResetToken(token);
  const passwordHash = await hashPassword(password);
  const user = await db.$transaction(async (tx) => {
    const { count } = await tx.passwordReset.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (count === 0) return null;
    const reset = await tx.passwordReset.findUniqueOrThrow({ where: { tokenHash }, select: { userId: true } });
    return tx.user.update({
      where: { id: reset.userId },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
        failedLogins: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });
  });
  if (!user) return { error: "This link has expired or been used — ask for a new one." };
  if (!user.active) return { error: "This login has been turned off." };
  await startSession(user);
  redirect("/");
}
