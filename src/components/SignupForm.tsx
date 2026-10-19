"use client";

import { useState, type FormEvent } from "react";
import { signUpFromWebsite } from "@/lib/actions/websiteSignup";
import type { PageTextStyle, SignupLook } from "@/lib/pageStyleLayout";
import type { SignupFormContent } from "@/lib/signupForms";
import { MAX_EMAIL_LENGTH } from "@/lib/emailAddress";
import { useSiteData } from "@/lib/siteData";
import { useTurnstile } from "@/lib/useTurnstile";
import { bodyTextCss } from "@/components/textStyleCss";

// A website sign-up form on a page (2026-10-10, Marketing step 5) — see
// lib/signupForms.ts. An email box and a button in the style's button
// colours, the consent line below; once signed up, the thank-you
// message in its place. Words in the style's Text look.
//
// On the published site it signs the visitor up, after Cloudflare
// Turnstile's check (lib/useTurnstile.ts). In the admin preview it's
// only shown.

const UNAVAILABLE = "Sign-up isn't available right now — please try again later.";

export default function SignupForm({
  pageId,
  form,
  look,
  textStyle,
}: {
  pageId: string;
  form: SignupFormContent;
  look: SignupLook;
  textStyle: PageTextStyle;
}) {
  const { forms: signup } = useSiteData();
  const siteKey = signup?.siteKey ?? null;
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = useTurnstile(siteKey, !done);
  const token = check.token;
  const shownError = error ?? (check.failed ? UNAVAILABLE : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!signup || sending) return;
    if (!siteKey) {
      setError(UNAVAILABLE);
      return;
    }
    if (!token) {
      setError("Just a moment — checking you're not a robot. Please try again.");
      return;
    }
    setSending(true);
    setError(null);
    const result = await signUpFromWebsite({
      siteId: signup.siteId,
      pageId,
      blockId: form.blockId,
      email,
      token,
    }).catch(() => ({ error: UNAVAILABLE }));
    setSending(false);
    if ("error" in result) {
      setError(result.error);
      // A check can only be used once.
      check.reset();
      return;
    }
    setDone(true);
  };

  const text = bodyTextCss(textStyle);

  if (done) {
    return (
      <p className="text-sm text-neutral-800" style={text} role="status">
        {form.thanksText}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" style={text} noValidate>
      <div className="flex flex-wrap gap-2">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={form.placeholder}
          aria-label={form.placeholder}
          maxLength={MAX_EMAIL_LENGTH}
          disabled={!signup}
          className="min-w-[12rem] flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
          style={{ fontFamily: text.fontFamily, fontSize: text.fontSize }}
        />
        <button
          type="submit"
          disabled={!signup || sending}
          className="rounded-md px-5 py-2 disabled:cursor-default"
          style={{
            backgroundColor: look.buttonColour,
            color: look.buttonTextColour,
            fontFamily: text.fontFamily,
            fontSize: text.fontSize,
          }}
        >
          {sending ? "…" : form.buttonLabel}
        </button>
      </div>
      <div ref={check.checkRef} />
      {shownError && (
        <p className="text-sm text-red-600" role="alert">
          {shownError}
        </p>
      )}
      <p className="text-xs text-neutral-500" style={{ fontFamily: text.fontFamily, color: text.color }}>
        {form.consentText}
      </p>
    </form>
  );
}
