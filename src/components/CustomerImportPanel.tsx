"use client";

import { useState } from "react";
import {
  parseCustomerImportCsv,
  importCustomerRow,
  type NormalizedCustomerRow,
} from "@/lib/actions/customerImport";

export default function CustomerImportPanel({
  artistId,
  onClose,
  onImported,
}: {
  artistId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [rows, setRows] = useState<NormalizedCustomerRow[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(0);
  const [created, setCreated] = useState(0);
  const [merged, setMerged] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [finished, setFinished] = useState(false);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setParsing(true);
    setRows(null);
    setFinished(false);
    setDone(0);
    setCreated(0);
    setMerged(0);
    setSkipped(0);
    try {
      const text = await file.text();
      const result = await parseCustomerImportCsv(text);
      setRows(result.rows);
      setParseErrors(result.parseErrors);
    } finally {
      setParsing(false);
    }
  };

  const handleStartImport = async () => {
    if (!rows) return;
    setImporting(true);
    setDone(0);
    setCreated(0);
    setMerged(0);
    setSkipped(0);
    // Sequential rather than Promise.all, purely so the progress bar is
    // honest — there's no external network call here that could time
    // out or that benefits from throttling, unlike the artwork import.
    for (const row of rows) {
      const result = await importCustomerRow(artistId, row);
      if (result.outcome === "created") setCreated((n) => n + 1);
      else if (result.outcome === "merged") setMerged((n) => n + 1);
      else setSkipped((n) => n + 1);
      setDone((n) => n + 1);
    }
    setImporting(false);
    setFinished(true);
    onImported();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Import Customers from CSV</h2>
          {!importing && (
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-neutral-400 hover:text-neutral-700"
            >
              Close ✕
            </button>
          )}
        </div>

        {!rows && !parsing && (
          <div>
            <p className="mb-3 text-sm text-neutral-500">
              Choose a CSV export. Expected columns: First Name, Surname, Email, Phone, Address.
              Anyone already in the system (matched by email) gets any blank fields filled in
              rather than a duplicate — nothing already saved is overwritten.
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
          </div>
        )}

        {parsing && <p className="text-sm text-neutral-500">Reading {fileName}…</p>}

        {rows && !importing && !finished && (
          <div>
            <p className="mb-2 text-sm text-neutral-700">
              <span className="font-medium">{fileName}</span> — {rows.length} customer
              {rows.length === 1 ? "" : "s"} found.
            </p>
            {parseErrors.length > 0 && (
              <div className="mb-2 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
                {parseErrors.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
            )}
            <div className="mb-4 max-h-40 overflow-y-auto rounded-md border border-neutral-200 p-2 text-xs text-neutral-500">
              {rows.slice(0, 8).map((r, i) => (
                <p key={i} className="truncate">
                  {r.firstName} {r.lastName} {r.email ? `— ${r.email}` : ""}
                </p>
              ))}
              {rows.length > 8 && <p>…and {rows.length - 8} more</p>}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleStartImport}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
              >
                Import {rows.length} customer{rows.length === 1 ? "" : "s"}
              </button>
              <button
                type="button"
                onClick={() => setRows(null)}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
              >
                Choose a different file
              </button>
            </div>
          </div>
        )}

        {(importing || finished) && rows && (
          <div>
            <p className="mb-2 text-sm text-neutral-700">
              {finished ? "Done — " : "Importing… "}
              {done} of {rows.length}
            </p>
            <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full bg-neutral-900 transition-all"
                style={{ width: `${(done / rows.length) * 100}%` }}
              />
            </div>
            {finished && (
              <>
                <p className="mb-4 text-xs text-neutral-500">
                  {created} added
                  {merged > 0 && `, ${merged} merged into existing contacts`}
                  {skipped > 0 && `, ${skipped} skipped (no name)`}.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
                >
                  Done
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
