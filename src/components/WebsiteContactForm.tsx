"use client";

import { useState, type FormEvent } from "react";
import { sendBusinessContact } from "@/lib/actions/businessContact";
import { CONTACT_MAX_MESSAGE, CONTACT_MAX_NAME } from "@/lib/businessWebsite";
import { MAX_EMAIL_LENGTH } from "@/lib/emailAddress";
import { useTurnstile } from "@/lib/useTurnstile";
import { websiteSerif } from "@/lib/websiteFonts";

// The business website's contact form (2026-10-20, direct request): name,
// email and message, sliding open over the Home page's sidebar (see
// WebsiteHomeView). Sending is lib/actions/businessContact.ts, after
// Cloudflare Turnstile's check (lib/useTurnstile.ts). `siteKey` is
// undefined in the editor's preview, where the form is only shown;
// null on the live site when the robot check isn't set up yet.

const UNAVAILABLE = "Messages can't be sent right now — please try again later.";

const labelCls = "block text-[10px] font-medium uppercase tracking-[0.2em] text-[#AB5C2E]";
const fieldCls =
  "mt-1 w-full border-0 border-b border-[#CFC6A6] bg-transparent px-0 py-1.5 text-[15px] text-[#191714] outline-none focus:border-[#AB5C2E]";

export default function WebsiteContactForm({
  siteKey,
  active,
  onClose,
}: {
  siteKey?: string | null;
  // Open — the robot check only runs while it is.
  active: boolean;
  onClose: () => void;
}) {
  const preview = siteKey === undefined;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = useTurnstile(siteKey ?? null, active && !sent);
  const shownError = error ?? (check.failed ? UNAVAILABLE : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (preview) return setError("Messages are sent from the live website.");
    if (!siteKey) return setError(UNAVAILABLE);
    if (!check.token) return setError("Just a moment — checking you're not a robot. Please try again.");
    setSending(true);
    setError(null);
    const result = await sendBusinessContact({ name, email, message, token: check.token }).catch(() => ({
      error: UNAVAILABLE,
    }));
    setSending(false);
    if ("error" in result) {
      setError(result.error);
      // A check can only be used once.
      check.reset();
      return;
    }
    setSent(true);
  };

  return (
    <div className="mx-auto w-full max-w-[340px]">
      <div className="flex items-baseline justify-between">
        <h2 className={`${websiteSerif.className} text-[28px] leading-none text-[#555555]`}>Contact</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] uppercase tracking-[0.2em] text-[#AB5C2E] hover:underline"
        >
          Close
        </button>
      </div>

      {sent ? (
        <p className={`${websiteSerif.className} mt-8 text-[20px] leading-snug text-[#191714]`}>
          Thank you — your message has been sent. We&apos;ll be in touch soon.
        </p>
      ) : (
        <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-6">
          <label>
            <span className={labelCls}>Name</span>
            <input
              type="text"
              autoComplete="name"
              value={name}
              maxLength={CONTACT_MAX_NAME}
              onChange={(e) => setName(e.target.value)}
              className={fieldCls}
            />
          </label>
          <label>
            <span className={labelCls}>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              maxLength={MAX_EMAIL_LENGTH}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldCls}
            />
          </label>
          <label>
            <span className={labelCls}>Message</span>
            <textarea
              rows={6}
              value={message}
              maxLength={CONTACT_MAX_MESSAGE}
              onChange={(e) => setMessage(e.target.value)}
              className={`${fieldCls} resize-y`}
            />
          </label>

          <div ref={check.checkRef} />
          {shownError && <p className="text-[13px] text-[#A33B2B]">{shownError}</p>}

          <button
            type="submit"
            disabled={sending}
            className="self-start border border-[#191714] px-6 py-2 text-[11px] uppercase tracking-[0.2em] text-[#191714] transition-colors hover:bg-[#191714] hover:text-[#EEE7CB] disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
      )}
    </div>
  );
}
