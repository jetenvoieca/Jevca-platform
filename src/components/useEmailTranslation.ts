"use client";

import { useState } from "react";
import { translateEmailToEnglish } from "@/lib/actions/translateEmail";

// Translate / Show original on an opened email (2026-10-09), shared by
// every Inbox email tab. A translation is kept for as long as the window
// is open, so switching back and forth doesn't translate it again.
export function useEmailTranslation() {
  const [translations, setTranslations] = useState<Record<string, { subject: string; body: string }>>({});
  const [shownId, setShownId] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const toggle = async (id: string, subject: string, text: string) => {
    if (shownId[id]) {
      setShownId((s) => ({ ...s, [id]: false }));
      return;
    }
    if (translations[id]) {
      setShownId((s) => ({ ...s, [id]: true }));
      return;
    }
    setBusyId(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    try {
      const res = await translateEmailToEnglish(subject, text);
      if (!res.ok) {
        setErrors((e) => ({ ...e, [id]: res.error }));
        return;
      }
      setTranslations((t) => ({ ...t, [id]: { subject: res.subject, body: res.body } }));
      setShownId((s) => ({ ...s, [id]: true }));
    } catch {
      setErrors((e) => ({ ...e, [id]: "Translation took too long — try again." }));
    } finally {
      setBusyId(null);
    }
  };

  return {
    // The English to show for this email, or null for the original.
    shown: (id: string) => (shownId[id] ? (translations[id] ?? null) : null),
    busy: (id: string) => busyId === id,
    error: (id: string) => errors[id] || null,
    label: (id: string) => (busyId === id ? "Translating…" : shownId[id] ? "Show original" : "Translate"),
    toggle,
    // Forgets everything — when the window closes.
    reset: () => {
      setTranslations({});
      setShownId({});
      setErrors({});
    },
  };
}
