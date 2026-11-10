"use client";

import { useState, type InputHTMLAttributes } from "react";

// A password box with Show / Hide (2026-11-10, Craig's request) — used
// wherever a password is typed: logging in, a new or reset password, a
// client's login, the first admin set-up and sign-up. Takes an ordinary
// input's props; `className` styles the box.
export default function PasswordInput({ className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} className={`${className} block pr-16`} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-xs text-neutral-500 hover:text-neutral-800"
      >
        {shown ? "Hide" : "Show"}
      </button>
    </div>
  );
}
