"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/lib/actions/auth";

const initialState: LoginState = {};
const box =
  "mb-3 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

export default function LoginForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState(login, initialState);

  return (
    <form
      action={formAction}
      className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <h1 className="mb-1 text-lg font-semibold text-neutral-900">
        JEVCA Studio
      </h1>
      <p className="mb-4 text-sm text-neutral-500">
        Log in with your email and password.
      </p>

      <input type="hidden" name="next" value={next} />
      <input
        type="email"
        name="email"
        autoComplete="username"
        autoFocus
        required
        placeholder="Email"
        className={box}
      />
      <input
        type="password"
        name="password"
        autoComplete="current-password"
        required
        placeholder="Password"
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
        {isPending ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}
