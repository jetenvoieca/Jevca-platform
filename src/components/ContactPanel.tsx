"use client";

import { createContext, useContext, useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { ContactPanelSettings } from "@/lib/contactPanel";
import { sendWebsiteContact } from "@/lib/actions/websiteContact";
import { MAX_EMAIL_LENGTH } from "@/lib/emailAddress";
import { useSiteData } from "@/lib/siteData";
import { useTurnstile } from "@/lib/useTurnstile";
import { SITE_FONT_FAMILY } from "@/lib/siteFontFaces";

// A site's Contact panel (2026-11-03 — see lib/contactPanel.ts): its ✕,
// title, the artist's phone and email (from Settings), and the form —
// name, email, message, the mailing list tick box and Send — plain, as on
// the old ISYT sites, in the panel's own look. Whoever shows a page and
// knows the panel is open (the published site, the Pages page's preview)
// says so with ContactPanelProvider; the page lays the panel over itself
// (PagePreview's StyledFrame). It slides in from the right as it appears;
// its ✕ slides it away, then tells the provider it's closed. Sending is
// lib/actions/websiteContact.ts, after Cloudflare Turnstile's check
// (lib/useTurnstile.ts) — only from the published site (siteData.forms);
// in the admin's preview the form is only shown.

const UNAVAILABLE = "Messages can't be sent right now — please try again later.";
const MAX_NAME = 100;
const MAX_MESSAGE = 5000;
const SLIDE_SECONDS = 0.6;

// The open panel: its settings, and what to do once it has slid away.
type OpenPanel = { settings: ContactPanelSettings; onClosed: () => void };

const ContactPanelContext = createContext<OpenPanel | null>(null);

// Shows the panel (`panel`, null = closed) over the page inside.
export function ContactPanelProvider({ panel, children }: { panel: OpenPanel | null; children: ReactNode }) {
  return <ContactPanelContext.Provider value={panel}>{children}</ContactPanelContext.Provider>;
}

// The panel to lay over the page, if it's open.
export function useOpenContactPanel(): OpenPanel | null {
  return useContext(ContactPanelContext);
}

export default function ContactPanel({ settings, onClosed }: OpenPanel) {
  const siteData = useSiteData();
  const site = siteData.forms;
  // "start": drawn off to the right, about to slide in; "in": showing;
  // "out": sliding away.
  const [phase, setPhase] = useState<"start" | "in" | "out">("start");
  const [contact, setContact] = useState<{ phone: string | null; email: string | null } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [join, setJoin] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = useTurnstile(site?.siteKey ?? null, phase === "in" && !sent);
  const shownError = error ?? (check.failed ? UNAVAILABLE : null);

  // The artist's phone and email.
  useEffect(() => {
    let current = true;
    siteData.getArtist().then((artist) => {
      if (current) setContact(artist?.contact ?? null);
    });
    return () => {
      current = false;
    };
  }, [siteData]);

  // Slides in once it's been drawn off to the right.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setPhase("in"));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Closed once it has slid away.
  useEffect(() => {
    if (phase !== "out") return;
    const timer = setTimeout(onClosed, SLIDE_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [phase, onClosed]);

  const look: CSSProperties = {
    background: settings.background,
    color: settings.textColour,
    fontFamily: SITE_FONT_FAMILY[settings.font],
    fontSize: settings.textSize,
    transform: phase === "in" ? "translateX(0)" : "translateX(105%)",
    transition: phase === "start" ? "none" : `transform ${SLIDE_SECONDS}s ease-out`,
  };
  const field: CSSProperties = { font: "inherit", color: "#222222" };
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

  return (
    <div className="relative h-full px-6 pb-8 pt-1 shadow-[-12px_0_24px_-16px_rgba(0,0,0,0.35)]" style={look}>
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
      {(contact?.phone || contact?.email) && (
        <div className="mb-6 flex flex-col gap-2">
          {contact.phone && (
            <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="self-start hover:underline">
              {contact.phone}
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="self-start hover:underline">
              {contact.email}
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
  );
}
