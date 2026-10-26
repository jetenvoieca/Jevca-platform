"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/passwords";
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
