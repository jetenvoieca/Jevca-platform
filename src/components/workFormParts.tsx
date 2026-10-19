"use client";

import type { CSSProperties, ReactNode } from "react";
import type { PresentationSettings } from "@/lib/presentationTemplate";
import { SITE_FONT_FAMILY } from "@/lib/siteFontFaces";

// What the Presentation window's forms share (2026-10-19) — the enquiry
// form (WorkEnquiryForm) and the payment form (WorkPaymentForm): the
// look of their boxes, labels and buttons, from the template's settings.

export function formLook(settings: PresentationSettings) {
  const { colours } = settings;
  const field: CSSProperties = {
    background: colours.fieldBackground,
    color: colours.text,
    fontFamily: SITE_FONT_FAMILY[settings.textFont],
    fontSize: Math.round(settings.textSize * 0.95),
  };
  return {
    field,
    fieldClass: "w-full min-w-0 border-0 px-5 py-3 outline-none focus:ring-1 focus:ring-current",
    small: Math.round(settings.textSize * 0.75),
    buttonClass:
      "inline-flex min-h-14 items-center justify-center px-6 py-3 text-center uppercase tracking-[0.2em] transition-opacity hover:opacity-90 disabled:opacity-60",
    button: (background: string, color: string): CSSProperties => ({
      background,
      color,
      borderRadius: settings.buttonRounding,
      fontSize: Math.round(settings.textSize * 0.8),
    }),
  };
}

// The form's frame.
export function FormBox({ settings, children }: { settings: PresentationSettings; children: ReactNode }) {
  return (
    <div
      className="flex flex-col gap-6 p-5"
      style={{ border: `1px solid ${settings.colours.border}`, fontFamily: SITE_FONT_FAMILY[settings.textFont] }}
    >
      {children}
    </div>
  );
}

// A box's small capitals label above it.
export function Labelled({
  settings,
  text,
  children,
}: {
  settings: PresentationSettings;
  text: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      {text && (
        <span
          className="uppercase tracking-[0.15em]"
          style={{ color: settings.colours.muted, fontSize: formLook(settings).small }}
        >
          {text}
        </span>
      )}
      {children}
    </label>
  );
}

// A problem with what was sent — or, in the admin's previews (`preview`),
// a quiet note that the form only works on the published site.
export function FormMessage({
  settings,
  text,
  preview,
}: {
  settings: PresentationSettings;
  text: string | null;
  preview: boolean;
}) {
  if (!text) return null;
  return (
    <p role="alert" style={{ color: preview ? settings.colours.muted : "#dc2626", fontSize: formLook(settings).small }}>
      {text}
    </p>
  );
}

// What a finished form says in its place.
export function FormDone({ settings, text }: { settings: PresentationSettings; text: string }) {
  return (
    <p role="status" style={{ fontSize: settings.textSize, lineHeight: settings.lineSpacing }}>
      {text}
    </p>
  );
}
