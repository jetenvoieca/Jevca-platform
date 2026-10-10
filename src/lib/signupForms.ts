// Website sign-up forms (2026-10-10, Marketing step 5) — the shapes and
// rules shared by the server actions (lib/actions/signupForms.ts,
// lib/actions/websiteSignup.ts), the page (SignupForm) and its set-up
// window in Arrange (SignupFormSetup). Plain module, not "use server".
//
// A "Sign-up form" component in a Block Build Page Style (its button
// colours are in the style — see SignupLook in lib/pageStyleLayout.ts)
// is set up on each page in Arrange: the mail list sign-ups join and
// the form's wording (Craig's choices). Visitors give their email
// address only, and are subscribed straight away — no confirmation
// mail — once Cloudflare Turnstile has checked they're a person (see
// lib/turnstile.ts).

export type SignupWording = {
  // The words shown in the empty email box.
  placeholder: string;
  buttonLabel: string;
  // The small line under the form saying what they're agreeing to.
  consentText: string;
  // Shown in place of the form once they've signed up.
  thanksText: string;
};

// One form on a page, as the page draws it. The list stays on the
// server.
export type SignupFormContent = SignupWording & { blockId: string };

// A form's set-up, as Arrange edits it.
export type SignupFormSetup = SignupWording & { listId: string | null };

export const SIGNUP_LIMITS: Record<keyof SignupWording, number> = {
  placeholder: 60,
  buttonLabel: 40,
  consentText: 400,
  thanksText: 200,
};

export const SIGNUP_FIELDS: { key: keyof SignupWording; label: string; multiline: boolean }[] = [
  { key: "placeholder", label: "Email box", multiline: false },
  { key: "buttonLabel", label: "Button", multiline: false },
  { key: "consentText", label: "Consent line", multiline: true },
  { key: "thanksText", label: "Thank-you message", multiline: false },
];

// The wording a new form starts with, naming the artist in the consent
// line.
export function defaultSignupWording(artistName: string): SignupWording {
  return {
    placeholder: "Your email address",
    buttonLabel: "Subscribe",
    consentText: `By subscribing you agree to receive emails from ${artistName}. You can unsubscribe at any time.`,
    thanksText: "Thank you — you're subscribed.",
  };
}

// Trimmed and cut to length; every field is required.
export function cleanSignupWording(
  raw: Partial<Record<keyof SignupWording, unknown>>
): SignupWording | { error: string } {
  const out = {} as SignupWording;
  for (const f of SIGNUP_FIELDS) {
    const value = typeof raw[f.key] === "string" ? (raw[f.key] as string).trim() : "";
    if (!value) return { error: `Fill in the ${f.label.toLowerCase()}.` };
    out[f.key] = value.slice(0, SIGNUP_LIMITS[f.key]);
  }
  return out;
}

// What a sign-up reports back to the page. The same "ok" whether or not
// the address was already on file, so the form can't be used to find
// out who is.
export type SignupResult = { ok: true } | { error: string };
