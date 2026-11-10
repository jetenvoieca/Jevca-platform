"use client";

import { useActionState } from "react";
import { resetPassword, type LoginState } from "@/lib/actions/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwordRules";

const initialState: LoginState = {};
const box = "mb-3 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

// Choosing a new password from a reset link (2026-11-10); logs in after.
export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(resetPassword, initialState);

  return (
    <form action={formAction} className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <h1 className="mb-1 text-lg font-semibold text-neutral-900">Choose a new password</h1>
      <p className="mb-4 text-sm text-neutral-500">At least {MIN_PASSWORD_LENGTH} characters.</p>
      <input type="hidden" name="token" value={token} />
      <input
        type="password"
        name="password"
        autoComplete="new-password"
        autoFocus
        required
        minLength={MIN_PASSWORD_LENGTH}
        placeholder="New password"
        className={box}
      />
      <input type="password" name="again" autoComplete="new-password" required placeholder="New password again" className={box} />
      {state.error && <p className="mb-3 text-xs text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save and log in"}
      </button>
    </form>
  );
}
