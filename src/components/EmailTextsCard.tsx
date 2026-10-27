"use client";

import { useState, useTransition } from "react";
import { saveEmailText } from "@/lib/actions/emailTexts";
import {
  EMAIL_TEXT_KEYS,
  EMAIL_TEXTS,
  defaultEmailText,
  type EmailText,
  type EmailTextKey,
} from "@/lib/emailTexts";

// Settings → Financial → Email texts (2026-10-27, Craig's request): the
// subject and message of each email the app writes for this client, as
// they're used — each one's default until changed. One open at a time;
// Save keeps it, Back to default puts the default back. See
// lib/emailTexts.ts.
export default function EmailTextsCard({
  artistId,
  texts: initialTexts,
}: {
  artistId: string;
  texts: Record<EmailTextKey, EmailText>;
}) {
  const [texts, setTexts] = useState(initialTexts);
  const [openKey, setOpenKey] = useState<EmailTextKey | null>(null);
  const [draft, setDraft] = useState<EmailText>({ subject: "", body: "" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const open = (key: EmailTextKey) => {
    if (openKey === key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(key);
    setDraft(texts[key]);
    setError(null);
    setSaved(false);
  };

  const save = (key: EmailTextKey, text: EmailText) => {
    setError(null);
    startTransition(async () => {
      const result = await saveEmailText(artistId, key, text.subject, text.body);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setTexts((prev) => ({ ...prev, [key]: result.text }));
      setDraft(result.text);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  const isDefault = (key: EmailTextKey, text: EmailText) => {
    const fallback = defaultEmailText(key);
    return text.subject === fallback.subject && text.body === fallback.body;
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h3 className="mb-1 text-sm font-medium text-neutral-900">Email texts</h3>
      <p className="mb-3 text-xs text-neutral-500">
        What each email says when it&apos;s first opened — every one can still be changed before it&apos;s
        sent. Words in braces, like {"{first name}"}, are filled in for you; a line whose word has nothing
        to fill it is left out.
      </p>

      <div className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
        {EMAIL_TEXT_KEYS.map((key) => {
          const def = EMAIL_TEXTS[key];
          const isOpen = openKey === key;
          const changed = isOpen ? draft.subject !== texts[key].subject || draft.body !== texts[key].body : false;
          return (
            <div key={key}>
              <button
                type="button"
                onClick={() => open(key)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-neutral-50"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-neutral-900">{def.label}</span>
                  <span className="block text-xs text-neutral-500">{def.detail}</span>
                </span>
                <span className="shrink-0 text-xs text-neutral-400">
                  {isDefault(key, texts[key]) ? "Default" : "Own wording"} {isOpen ? "▴" : "▾"}
                </span>
              </button>

              {isOpen && (
                <div className="space-y-3 px-3 pb-4 pt-1">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-700">Subject</label>
                    <input
                      type="text"
                      value={draft.subject}
                      onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                      className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-700">Message</label>
                    <textarea
                      value={draft.body}
                      onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                      rows={12}
                      className="w-full resize-y rounded-md border border-neutral-300 px-2 py-1.5 font-sans text-sm"
                    />
                  </div>
                  <p className="text-xs text-neutral-500">Fills in: {def.markers.join("  ")}</p>
                  {error && <p className="text-xs text-red-600">{error}</p>}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => save(key, draft)}
                      disabled={isPending || !changed}
                      className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => save(key, defaultEmailText(key))}
                      disabled={isPending || isDefault(key, draft)}
                      className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-40"
                    >
                      Back to default
                    </button>
                    {saved && <span className="text-xs text-green-600">Saved</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
