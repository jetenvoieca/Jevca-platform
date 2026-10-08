"use client";

import { useState } from "react";
import {
  importSubscribers,
  parseSubscriberCsv,
  type MailListSummary,
  type ParsedSubscriberCsv,
} from "@/lib/actions/subscribers";
import {
  ConsentCheckbox,
  ListSelect,
  SubscriberModal,
  primaryButtonCls,
  secondaryButtonCls,
} from "@/components/subscriberFormParts";

// Rows sent to the server per call, so progress can be shown and no one
// request gets too large (the server accepts up to 500).
const CHUNK_SIZE = 250;

// Marketing → Subscribers → Import CSV (2026-10-08). Anyone already on
// file (matched by email) keeps their details and status — an
// Unsubscribed person is never subscribed again — but is still put into
// the chosen list.
export default function SubscriberImportPanel({
  artistId,
  artistName,
  lists,
  initialListId,
  onImported,
  onClose,
}: {
  artistId: string;
  artistName: string;
  lists: MailListSummary[];
  initialListId: string | null;
  onImported: () => void;
  onClose: () => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedSubscriberCsv | null>(null);
  const [parsing, setParsing] = useState(false);
  const [listId, setListId] = useState<string | null>(initialListId);
  const [consent, setConsent] = useState(false);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(0);
  const [added, setAdded] = useState(0);
  const [alreadyOnFile, setAlreadyOnFile] = useState(0);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setParsed(null);
    setFileName(null);
    setError(null);
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setError(null);
    setParsing(true);
    try {
      const result = await parseSubscriberCsv(await file.text());
      if ("error" in result) setError(result.error);
      else setParsed(result);
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    setImporting(true);
    setError(null);
    setDone(0);
    setAdded(0);
    setAlreadyOnFile(0);
    for (let i = 0; i < parsed.rows.length; i += CHUNK_SIZE) {
      const chunk = parsed.rows.slice(i, i + CHUNK_SIZE);
      const result = await importSubscribers(artistId, chunk, listId, consent);
      if ("error" in result) {
        setError(result.error);
        break;
      }
      setAdded((n) => n + result.added);
      setAlreadyOnFile((n) => n + result.alreadyOnFile);
      setDone((n) => n + chunk.length);
    }
    setImporting(false);
    setFinished(true);
    onImported();
  };

  const total = parsed?.rows.length ?? 0;

  return (
    <SubscriberModal title="Import subscribers from CSV" busy={importing} onClose={onClose}>
      {!parsed && !parsing && (
        <>
          <p className="text-sm text-neutral-500">
            Choose a CSV file with an Email column. First name, Surname (or a single Name) and
            Language (EN or FR) columns are used if present. Anyone already on file is not
            changed.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="text-sm"
          />
        </>
      )}

      {parsing && <p className="text-sm text-neutral-500">Reading {fileName}…</p>}

      {parsed && !importing && !finished && (
        <>
          <p className="text-sm text-neutral-700">
            <span className="font-medium">{fileName}</span> — {total} email address
            {total === 1 ? "" : "es"} found
            {parsed.skipped > 0 && `, ${parsed.skipped} row${parsed.skipped === 1 ? "" : "s"} skipped (no valid email, or repeated)`}
            .
          </p>
          {parsed.parseErrors.length > 0 && (
            <div className="max-h-24 overflow-y-auto rounded-md bg-amber-50 p-2 text-xs text-amber-700">
              {parsed.parseErrors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
          <div className="max-h-40 overflow-y-auto rounded-md border border-neutral-200 p-2 text-xs text-neutral-500">
            {parsed.rows.slice(0, 8).map((r) => (
              <p key={r.email} className="truncate">
                {[r.firstName, r.lastName].filter(Boolean).join(" ") || "—"} — {r.email}
                {r.language ? ` (${r.language})` : ""}
              </p>
            ))}
            {total > 8 && <p>…and {total - 8} more</p>}
          </div>
          <ListSelect lists={lists} value={listId} onChange={setListId} />
          <ConsentCheckbox
            artistName={artistName}
            plural
            checked={consent}
            onChange={setConsent}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleImport}
              disabled={total === 0 || !consent}
              className={primaryButtonCls}
            >
              Import {total} subscriber{total === 1 ? "" : "s"}
            </button>
            <button type="button" onClick={reset} className={secondaryButtonCls}>
              Choose a different file
            </button>
          </div>
        </>
      )}

      {(importing || finished) && parsed && (
        <>
          <p className="text-sm text-neutral-700">
            {finished ? "Done — " : "Importing… "}
            {done} of {total}
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full bg-neutral-900 transition-all"
              style={{ width: `${total ? (done / total) * 100 : 0}%` }}
            />
          </div>
          {finished && (
            <>
              <p className="text-xs text-neutral-500">
                {added} added
                {alreadyOnFile > 0 && `, ${alreadyOnFile} already on file (left unchanged)`}.
              </p>
              <button type="button" onClick={onClose} className={primaryButtonCls}>
                Done
              </button>
            </>
          )}
        </>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </SubscriberModal>
  );
}
