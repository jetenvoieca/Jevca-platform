"use client";

import { useEffect, useRef, useState } from "react";

// Saving for the editors (2026-10-08, shared by Page Styles, Menus, Mail
// Templates and Mail Campaigns' mails): every change saves itself
// shortly after (`schedule`); a new item is created the first time it
// can be saved, and updated after that. An editor that only ever edits
// existing items (a campaign's mail) has no `create`. Saves run one at a
// time, in order, so a quick run of changes can never create an item
// twice. `flush` saves anything still waiting — used on Close, so
// nothing is lost.

export type SaveStatus = { text: string; isError: boolean };

export const IDLE_STATUS: SaveStatus = { text: "", isError: false };

const SAVE_DELAY_MS = 600;

type SaveResult = { ok: true } | { id: string } | { error: string };

export function useAutoSave<D>({
  create,
  update,
  cannotSave,
  onSaved,
}: {
  create?: (draft: D) => Promise<SaveResult>;
  update: (id: string, draft: D) => Promise<SaveResult>;
  // Why the draft can't be saved yet (e.g. it has no name), or null.
  cannotSave: (draft: D) => string | null;
  // After every save, with the saved item's id.
  onSaved: (id: string) => void;
}) {
  const [status, setStatus] = useState<SaveStatus>(IDLE_STATUS);
  // The item being edited — null while a new one hasn't been saved yet.
  const idRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<D | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const save = (draft: D) => {
    queueRef.current = queueRef.current.then(async () => {
      setStatus({ text: "Saving…", isError: false });
      try {
        const id = idRef.current;
        const result = id
          ? await update(id, draft)
          : create
            ? await create(draft)
            : { error: "Nothing to save to." };
        if ("error" in result) {
          setStatus({ text: result.error, isError: true });
          return;
        }
        if ("id" in result) idRef.current = result.id;
        setStatus({ text: "Saved", isError: false });
        if (idRef.current) onSaved(idRef.current);
      } catch {
        setStatus({ text: "Couldn't save — try again.", isError: true });
      }
    });
    return queueRef.current;
  };

  // Starts editing an existing item (its id), or a new one (null).
  const begin = (id: string | null) => {
    idRef.current = id;
    setStatus(IDLE_STATUS);
  };

  const schedule = (draft: D) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const reason = cannotSave(draft);
    if (reason) {
      pendingRef.current = null;
      setStatus({ text: reason, isError: false });
      return;
    }
    pendingRef.current = draft;
    timerRef.current = setTimeout(() => {
      pendingRef.current = null;
      save(draft);
    }, SAVE_DELAY_MS);
  };

  const flush = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const pending = pendingRef.current;
    pendingRef.current = null;
    await (pending ? save(pending) : queueRef.current);
    setStatus(IDLE_STATUS);
  };

  return { status, begin, schedule, flush };
}
