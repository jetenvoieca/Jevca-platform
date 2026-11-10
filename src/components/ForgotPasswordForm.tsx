"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type ResetRequestState } from "@/lib/actions/auth";

const initialState: ResetRequestState = {};

// "Forgot your password?" (2026-11-10): an email; a link to choose a new
// password is sent to it if it has a login.
export default function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, initialState);

  return (
    <form action={formAction} className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <h1 className="mb-1 text-lg font-semibold text-neutral-900">Forgot your password?</h1>
      {state.sent ? (
        <p className="mb-4 text-sm text-neutral-600">
          If that email has a login, we&apos;ve sent it a link to choose a new password. It lasts an hour.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-neutral-500">
            Enter the email you log in with and we&apos;ll send you a link to choose a new one.
          </p>
          <input
            type="email"
            name="email"
            autoComplete="username"
            autoFocus
            required
            placeholder="Email"
            className="mb-3 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          {state.error && <p className="mb-3 text-xs text-red-600">{state.error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="mb-3 w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {isPending ? "Sending…" : "Send link"}
          </button>
        </>
      )}
      <Link href="/login" className="text-sm text-neutral-500 hover:text-neutral-800">
        ← Back to log in
      </Link>
    </form>
  );
}
