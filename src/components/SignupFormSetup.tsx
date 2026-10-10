"use client";

import { useEffect, useState } from "react";
import { clearSignupForm, getSignupFormSetup, saveSignupForm } from "@/lib/actions/signupForms";
import type { MailListSummary } from "@/lib/actions/subscribers";
import { SIGNUP_FIELDS, SIGNUP_LIMITS, type SignupFormSetup as Setup } from "@/lib/signupForms";
import FormModal from "@/components/FormModal";

// Setting up one Sign-up form on a page (2026-10-10) — opened from the
// form's Set up button in Arrange (PageSectionsArranger): the mail list
// sign-ups join (Craig's choice: per page) and the form's wording, which
// starts filled in with standard wording. Remove clears it, so the page
// shows nothing there.
export default function SignupFormSetup({
  siteId,
  pageId,
  blockId,
  onClose,
  onSaved,
}: {
  siteId: string;
  pageId: string;
  blockId: string;
  onClose: () => void;
  // Whether the form is now set up.
  onSaved: (setUp: boolean) => void;
}) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [lists, setLists] = useState<MailListSummary[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSignupFormSetup(siteId, pageId, blockId).then((data) => {
      if (!data) {
        setError("Site not found.");
        return;
      }
      setLists(data.lists);
      setSaved(!!data.setup);
      setSetup(data.setup ?? { ...data.defaults, listId: data.lists.length === 1 ? data.lists[0].id : null });
    });
  }, [siteId, pageId, blockId]);

  const run = async (change: () => Promise<{ ok: true } | { error: string }>, setUp: boolean) => {
    setBusy(true);
    setError(null);
    const result = await change();
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onSaved(setUp);
    onClose();
  };

  const field = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

  return (
    <FormModal title="Sign-up form" busy={busy} onClose={onClose}>
      {!setup ? (
        <p className="text-sm text-neutral-400">{error ?? "Loading…"}</p>
      ) : (
        <>
          <label className="block text-sm text-neutral-700">
            Mail list sign-ups join
            {lists.length === 0 ? (
              <p className="mt-1 text-sm text-amber-700">
                No mail lists yet — add one under Marketing → Subscribers first.
              </p>
            ) : (
              <select
                value={setup.listId ?? ""}
                onChange={(e) => setSetup({ ...setup, listId: e.target.value || null })}
                className={`mt-1 ${field}`}
              >
                <option value="">Choose a list…</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          {SIGNUP_FIELDS.map((f) => (
            <label key={f.key} className="block text-sm text-neutral-700">
              {f.label}
              {f.multiline ? (
                <textarea
                  value={setup[f.key]}
                  onChange={(e) => setSetup({ ...setup, [f.key]: e.target.value })}
                  maxLength={SIGNUP_LIMITS[f.key]}
                  rows={3}
                  className={`mt-1 ${field}`}
                />
              ) : (
                <input
                  value={setup[f.key]}
                  onChange={(e) => setSetup({ ...setup, [f.key]: e.target.value })}
                  maxLength={SIGNUP_LIMITS[f.key]}
                  className={`mt-1 ${field}`}
                />
              )}
            </label>
          ))}

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between pt-1">
            {saved ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => clearSignupForm(siteId, pageId, blockId), false)}
                className="text-sm text-red-600 hover:underline disabled:opacity-40"
              >
                Remove form
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              disabled={busy || lists.length === 0}
              onClick={() => run(() => saveSignupForm(siteId, pageId, blockId, setup), true)}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      )}
    </FormModal>
  );
}
