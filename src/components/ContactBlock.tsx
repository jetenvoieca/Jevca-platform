"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import type { ContactSettings, PageTextStyle } from "@/lib/pageStyleLayout";
import { sendWebsiteContact } from "@/lib/actions/websiteContact";
import { MAX_EMAIL_LENGTH } from "@/lib/emailAddress";
import { useSiteData } from "@/lib/siteData";
import { useTurnstile } from "@/lib/useTurnstile";
import { bodyTextCss } from "@/components/textStyleCss";
import { PAGE_BACKGROUND_CLASS } from "@/components/pageMargins";

// A Contact panel's contents (2026-11-03, the ISYT contact pages — see
// ContactSettings in lib/pageStyleLayout.ts): its ✕, title, the artist's
// phone and email, and the form — name, email, message, the mailing list
// tick box and Send — in the page's Text look, plain as on the old ISYT
// sites. The page lays it over the components below it (PagePreview's
// StyledFrame); it slides in from the right as it first appears, and its
// ✕ slides it away, then it's gone. Sending is
// lib/actions/websiteContact.ts, after Cloudflare Turnstile's check
// (lib/useTurnstile.ts) — only from the published site (siteData.forms);
// in the admin's previews the form is only shown.

const UNAVAILABLE = "Messages can't be sent right now — please try again later.";
const MAX_NAME = 100;
const MAX_MESSAGE = 5000;
const SLIDE_SECONDS = 0.6;

export default function ContactBlock({
  settings,
  textStyle,
  contentWidth,
  phone,
  email: artistEmail,
}: {
  settings: ContactSettings;
  textStyle: PageTextStyle;
  contentWidth: number;
  phone: string | null;
  email: string | null;
}) {
  const site = useSiteData().forms;
  // "start": drawn off to the right, about to slide in; "in": showing;
  // "out": sliding away; "gone": closed.
  const [phase, setPhase] = useState<"start" | "in" | "out" | "gone">("start");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [join, setJoin] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = useTurnstile(site?.siteKey ?? null, phase === "in" && !sent);
  const shownError = error ?? (check.failed ? UNAVAILABLE : null);

  // Slides in once it's been drawn off to the right.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setPhase("in"));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Gone once it has slid away.
  useEffect(() => {
    if (phase !== "out") return;
    const timer = setTimeout(() => setPhase("gone"), SLIDE_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "gone") return null;

  const text = bodyTextCss(textStyle, contentWidth);
  const field: CSSProperties = { font: "inherit", color: "inherit" };
  const fieldClass = "w-full max-w-md border border-neutral-500 bg-white px-2 py-1.5 outline-none focus:border-neutral-800";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (!site) return setError("Messages are sent from the published site.");
    if (!site.siteKey) return setError(UNAVAILABLE);
    if (!check.token) return setError("Just a moment — checking you're not a robot. Please try again.");
    setSending(true);
    setError(null);
    const result = await sendWebsiteContact({
      siteId: site.siteId,
      name,
      email,
      message,
      joinMailingList: join,
      token: check.token,
    }).catch(() => ({ error: UNAVAILABLE }));
    setSending(false);
    if ("error" in result) {
      setError(result.error);
      // A check can only be used once.
      check.reset();
      return;
    }
    setSent(true);
  };

  // In the page's background (its colours are set on the page around it),
  // over white for a page without one, so nothing below shows through.
  return (
    <div
      className="h-full bg-white shadow-[-12px_0_24px_-16px_rgba(0,0,0,0.35)]"
      style={{
        transform: phase === "in" ? "translateX(0)" : "translateX(105%)",
        transition: phase === "start" ? "none" : `transform ${SLIDE_SECONDS}s ease-out`,
      }}
    >
    <div className={`relative h-full px-6 pb-8 pt-1 ${PAGE_BACKGROUND_CLASS}`} style={text}>
      <button
        type="button"
        onClick={() => setPhase("out")}
        aria-label="Close"
        title="Close"
        className="absolute right-2 top-0 p-1 opacity-60 transition-opacity hover:opacity-100"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {settings.title && (
        <h2 className="mb-5 pr-8 font-bold leading-tight" style={{ fontSize: settings.titleSize }}>
          {settings.title}
        </h2>
      )}
      {(phone || artistEmail) && (
        <div className="mb-6 flex flex-col gap-2">
          {phone && (
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="self-start hover:underline">
              {phone}
            </a>
          )}
          {artistEmail && (
            <a href={`mailto:${artistEmail}`} className="self-start hover:underline">
              {artistEmail}
            </a>
          )}
        </div>
      )}

      {sent ? (
        <p role="status">Thank you — your message has been sent.</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <label className="flex flex-col gap-1.5">
            Your Name
            <input
              type="text"
              required
              autoComplete="name"
              value={name}
              maxLength={MAX_NAME}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
              style={field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            Your Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              maxLength={MAX_EMAIL_LENGTH}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
              style={field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            Message
            <textarea
              required
              rows={6}
              value={message}
              maxLength={MAX_MESSAGE}
              onChange={(e) => setMessage(e.target.value)}
              className={`${fieldClass} resize-y`}
              style={field}
            />
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={join}
              onChange={(e) => setJoin(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0"
            />
            Add me to the mailing list
          </label>

          <div ref={check.checkRef} />
          {shownError && (
            <p role="alert" style={{ color: site ? "#dc2626" : undefined, opacity: site ? 1 : 0.6 }}>
              {shownError}
            </p>
          )}

          <button
            type="submit"
            disabled={sending}
            className="w-40 self-start rounded border border-neutral-500 bg-neutral-100 px-4 py-1 transition-colors hover:bg-neutral-200 disabled:opacity-60"
            style={{ font: "inherit", color: "#222222" }}
          >
            {sending ? "…" : "Send"}
          </button>
        </form>
      )}
    </div>
    </div>
  );
}
