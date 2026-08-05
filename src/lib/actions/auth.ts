"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";

export type LoginState = { error?: string };

// Signature matches React's useActionState — called directly from
// LoginForm.tsx, no wrapper needed.
export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const password = (formData.get("password") as string) || "";
  const next = (formData.get("next") as string) || "/";
  const expected = process.env.APP_PASSWORD;

  if (!expected) {
    return { error: "APP_PASSWORD is not configured on the server yet." };
  }
  if (password !== expected) {
    return { error: "Incorrect password." };
  }

  const token = await createSessionToken();
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect(next.startsWith("/") ? next : "/");
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
