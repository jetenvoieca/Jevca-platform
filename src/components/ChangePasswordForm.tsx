"use client";

import { useActionState } from "react";
import { changeOwnPassword } from "@/lib/actions/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwordRules";

const box =
  "mb-3 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

// Changing your own password (2026-10-26) — logs you out everywhere else.
export default function ChangePasswordForm({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const [state, formAction, isPending] = useActionState(
    changeOwnPassword,
    {} as { error?: string; done?: boolean },
  );

  return (
    <form
      action={formAction}
      className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <h1 className="mb-1 text-lg font-semibold text-neutral-900">
        Your login
      </h1>
      <p className="mb-4 text-sm text-neutral-500">
        {name} — {email}
      </p>
      <input
        type="hidden"
        name="username"
        value={email}
        autoComplete="username"
      />
      <input
        type="password"
        name="current"
        required
        placeholder="Current password"
        autoComplete="current-password"
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
      {state.done && (
        <p className="mb-3 text-xs text-green-700">
          Password changed. You&apos;re logged out everywhere else.
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
