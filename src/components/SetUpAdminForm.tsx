"use client";

import { useActionState } from "react";
import { setUpAdmin, type LoginState } from "@/lib/actions/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwordRules";

const initialState: LoginState = {};
const box =
  "mb-3 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

// Setting up the admin account (2026-10-26) — shown on the login page
// only until it exists. The old shared password proves it's you.
export default function SetUpAdminForm() {
  const [state, formAction, isPending] = useActionState(
    setUpAdmin,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <h1 className="mb-1 text-lg font-semibold text-neutral-900">
        Set up your admin login
      </h1>
      <p className="mb-4 text-sm text-neutral-500">
        Logins are now per person. Enter the current shared password once, then
        choose your own email and password — from then on you log in with those.
      </p>

      <input
        type="password"
        name="shared"
        required
        placeholder="Current shared password"
        className={box}
      />
      <input
        type="text"
        name="name"
        required
        placeholder="Your name"
        autoComplete="name"
        className={box}
      />
      <input
        type="email"
        name="email"
        required
        placeholder="Your email"
        autoComplete="username"
        className={box}
      />
      <input
        type="password"
        name="password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        placeholder={`New password (at least ${MIN_PASSWORD_LENGTH} characters)`}
        autoComplete="new-password"
        className={box}
      />
      <input
        type="password"
        name="again"
        required
        placeholder="New password again"
        autoComplete="new-password"
        className={box}
      />

      {state.error && (
        <p className="mb-3 text-xs text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {isPending ? "Setting up…" : "Set up and log in"}
      </button>
    </form>
  );
}
