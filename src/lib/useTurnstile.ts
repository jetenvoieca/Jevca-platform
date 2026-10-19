"use client";

import { useEffect, useRef, useState } from "react";

// Cloudflare Turnstile's robot check in the browser (2026-10-10; shared
// by sign-up forms and the enquiry form 2026-10-19) — see
// lib/turnstile.ts. Draws the check into `checkRef` while `active`; it
// usually shows nothing, only asking the visitor to tick a box if it's
// unsure. `token` is what's sent with the form; a token can only be used
// once, so call `reset` after a refused send. `failed` when Cloudflare's
// script couldn't load.

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Turnstile = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      appearance: "interaction-only";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

// Loads Cloudflare's script once for the whole page.
let turnstileScript: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  turnstileScript ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("No Turnstile")));
    script.onerror = () => {
      turnstileScript = null;
      reject(new Error("Turnstile script failed to load"));
    };
    document.head.appendChild(script);
  });
  return turnstileScript;
}

export function useTurnstile(siteKey: string | null, active: boolean) {
  const checkRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!siteKey || !active) return;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !checkRef.current) return;
        widgetRef.current = turnstile.render(checkRef.current, {
          sitekey: siteKey,
          appearance: "interaction-only",
          callback: setToken,
          "expired-callback": () => setToken(null),
          "error-callback": () => setToken(null),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (widgetRef.current) window.turnstile?.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [siteKey, active]);

  const reset = () => {
    setToken(null);
    if (widgetRef.current) window.turnstile?.reset(widgetRef.current);
  };

  return { checkRef, token, failed, reset };
}
