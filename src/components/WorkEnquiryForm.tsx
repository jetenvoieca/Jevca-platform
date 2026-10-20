"use client";

import { useState, type FormEvent } from "react";
import type { CurationWorkPresentation } from "@/lib/actions/curations";
import { sendWebsiteEnquiry } from "@/lib/actions/websiteEnquiry";
import { MAX_EMAIL_LENGTH } from "@/lib/emailAddress";
import { fillLabel, type PresentationSettings } from "@/lib/presentationTemplate";
import type { SiteForms } from "@/lib/siteData";
import { useTurnstile } from "@/lib/useTurnstile";
import { FormBox, FormDone, FormMessage, Labelled, formLook } from "@/components/workFormParts";

// The Presentation window's enquiry form (2026-10-19, Craig's mock-up),
// sliding in over the work's words and buttons when Enquire is pressed
// (see WorkPresentation): name,
// email and message, the mailing list tick box, Send message, "Or DM on
// Instagram" and the artist's email address — in the template's look and
// wording (lib/presentationTemplate.ts). Sending is
// lib/actions/websiteEnquiry.ts, after Cloudflare Turnstile's check
// (lib/useTurnstile.ts). Only the published site sends (`site`); in the
// admin's previews the form is only shown.

const UNAVAILABLE = "Enquiries can't be sent right now — please try again later.";
const MAX_NAME = 100;
const MAX_MESSAGE = 5000;

export default function WorkEnquiryForm({
  data,
  settings,
  site,
  active,
}: {
  data: CurationWorkPresentation;
  settings: PresentationSettings;
  site: SiteForms | null;
  // Open — the robot check only runs while it is.
  active: boolean;
}) {
  const { colours, show, labels } = settings;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [join, setJoin] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = useTurnstile(site?.siteKey ?? null, active && !sent);
  const shownError = error ?? (check.failed ? UNAVAILABLE : null);

  const values = { artist: data.artistFirstName ?? "", instagram: data.instagramHandle ?? "" };
  const { field, fieldClass, buttonClass, button } = formLook(settings);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (!site) {
      setError("Enquiries are sent from the published site.");
      return;
    }
    if (!site.siteKey) return setError(UNAVAILABLE);
    if (!check.token) return setError("Just a moment — checking you're not a robot. Please try again.");
    setSending(true);
    setError(null);
    const result = await sendWebsiteEnquiry({
      siteId: site.siteId,
      artworkId: data.artworkId,
      name,
      email,
      message,
      joinMailingList: show.mailingList && join,
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
    <FormBox settings={settings}>
      {sent ? (
        <FormDone settings={settings} text={labels.sent} />
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
          <Labelled settings={settings} text={labels.nameLabel}>
            <input
              type="text"
              required
              autoComplete="name"
              value={name}
              maxLength={MAX_NAME}
              onChange={(e) => setName(e.target.value)}
              placeholder={labels.namePlaceholder}
              className={fieldClass}
              style={field}
            />
          </Labelled>
          <Labelled settings={settings} text={labels.emailLabel}>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              maxLength={MAX_EMAIL_LENGTH}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={labels.emailPlaceholder}
              className={fieldClass}
              style={field}
            />
          </Labelled>
          <Labelled settings={settings} text={labels.messageLabel}>
            <textarea
              required
              rows={6}
              value={message}
              maxLength={MAX_MESSAGE}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={fillLabel(labels.messagePlaceholder, values)}
              className={`${fieldClass} resize-y`}
              style={field}
            />
          </Labelled>

          {show.mailingList && labels.mailingList && (
            <label className="flex items-start gap-2" style={{ fontSize: Math.round(settings.textSize * 0.9) }}>
              <input
                type="checkbox"
                checked={join}
                onChange={(e) => setJoin(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0"
              />
              {labels.mailingList}
            </label>
          )}

          <div ref={check.checkRef} />
          <FormMessage settings={settings} text={shownError} preview={!site} />

          <div className="flex flex-wrap gap-4">
            <button
              type="submit"
              disabled={sending}
              className={buttonClass}
              style={button(colours.enquireBackground, colours.enquireText)}
            >
              {sending ? "…" : labels.send}
            </button>
            {show.instagram && data.instagramHandle && labels.instagram && (
              <a
                href={`https://instagram.com/${encodeURIComponent(data.instagramHandle)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center px-4 py-1 text-center transition-opacity hover:opacity-80 sm:whitespace-nowrap"
                style={{
                  border: `1px solid ${colours.border}`,
                  color: colours.text,
                  minHeight: settings.buttonHeight,
                  borderRadius: settings.buttonRounding,
                  fontSize: Math.round(settings.textSize * 0.95),
                }}
              >
                {fillLabel(labels.instagram, values)}
              </a>
            )}
          </div>
        </form>
      )}

      {show.enquiryEmail && data.enquiryEmail && (
        <a
          href={`mailto:${data.enquiryEmail}`}
          className="self-start hover:underline"
          style={{ color: colours.text, fontSize: Math.round(settings.textSize * 0.95) }}
        >
          {data.enquiryEmail}
        </a>
      )}
    </FormBox>
  );
}
