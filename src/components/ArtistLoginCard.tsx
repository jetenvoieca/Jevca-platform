"use client";

import { useState, useTransition } from "react";
import {
  saveArtistLogin,
  setArtistLoginActive,
  type ArtistLogin,
} from "@/lib/actions/users";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwordRules";
import { ARTIST_LOGINS_ENABLED } from "@/lib/userAccess";

// The client's own login (2026-10-26), on Administration → Clients: their
// name, email and a password you choose for them (blank keeps the
// current one), switched on or off.
export default function ArtistLoginCard({
  artistId,
  login,
  className = "",
}: {
  artistId: string;
  login: ArtistLogin | null;
  className?: string;
}) {
  const [current, setCurrent] = useState(login);
  const [name, setName] = useState(login?.name ?? "");
  const [email, setEmail] = useState(login?.email ?? "");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await saveArtistLogin(artistId, { name, email, password });
      if ("error" in result)
        return setMessage({ ok: false, text: result.error });
      setCurrent({
        id: current?.id ?? "",
        name: name.trim(),
        email: email.trim().toLowerCase(),
        active: current?.active ?? true,
        lastLoginAt: current?.lastLoginAt ?? null,
      });
      setPassword("");
      setMessage({
        ok: true,
        text: password ? "Saved — tell them their new password." : "Saved.",
      });
    });

  const toggle = () =>
    startTransition(async () => {
      if (!current) return;
      const result = await setArtistLoginActive(artistId, !current.active);
      if ("error" in result)
        return setMessage({ ok: false, text: result.error });
      setCurrent({ ...current, active: !current.active });
      setMessage(null);
    });

  const box =
    "w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm";
  return (
    <div className={`rounded-md border border-neutral-200 p-3 ${className}`}>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Their login
      </p>
      {!ARTIST_LOGINS_ENABLED && (
        <p className="mb-2 text-xs text-amber-700">
          Set up now; they can log in once artist logins are switched on.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className={box}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="off"
          className={box}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={
            current
              ? "New password (blank = keep)"
              : `First password (at least ${MIN_PASSWORD_LENGTH} characters)`
          }
          autoComplete="new-password"
          className={box}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {current ? "Save" : "Create login"}
          </button>
          {current && (
            <button
              type="button"
              onClick={toggle}
              disabled={isPending}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {current.active ? "Switch off" : "Switch on"}
            </button>
          )}
          {current && !current.active && (
            <span className="text-xs text-red-600">Switched off</span>
          )}
        </div>
        {message && (
          <p
            className={`text-xs ${message.ok ? "text-green-700" : "text-red-600"}`}
          >
            {message.text}
          </p>
        )}
        {current?.lastLoginAt && (
          <p className="text-xs text-neutral-400">
            Last logged in{" "}
            {new Date(current.lastLoginAt).toLocaleString("en-GB")}
          </p>
        )}
      </div>
    </div>
  );
}
