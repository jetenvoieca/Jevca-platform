"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  parseArtworkImportCsv,
  importArtworkRow,
  getCsvImportedArtworkIds,
  deleteArtworksByIds,
  type NormalizedArtworkRow,
} from "@/lib/actions/artworkImport";

type Failure = { row: NormalizedArtworkRow; error: string };

export default function ArtworkImportPanel({
  artistId,
  siteId,
  onClose,
}: {
  artistId: string;
  siteId: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<NormalizedArtworkRow[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(0);
  const [runTotal, setRunTotal] = useState(0);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [finished, setFinished] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const router = useRouter();

  const handleCleanUp = async () => {
    setCleaningUp(true);
    try {
      const ids = await getCsvImportedArtworkIds(artistId);
      if (ids.length === 0) {
        alert("No CSV-imported artworks found — nothing to delete.");
        return;
      }
      const confirmed = confirm(
        `Permanently delete all ${ids.length} artworks previously brought in by this CSV import ` +
          `(including their images)?\n\n` +
          `This only ever touches artworks this import feature created — nothing added any ` +
          `other way is affected. Use this to clear out duplicates from repeated import attempts ` +
          `before importing fresh.\n\nThis cannot be undone.`
      );
      if (!confirmed) return;
      const result = await deleteArtworksByIds(siteId, ids);
      router.refresh();
      if (result.failed.length > 0) {
        alert(
          `Deleted ${result.deleted}. ${result.failed.length} couldn't be deleted (likely ` +
            `already linked to a real sale) — left in place rather than risk removing something real.`
        );
      } else {
        alert(`Deleted ${result.deleted} artworks. Ready for a fresh import.`);
      }
    } finally {
      setCleaningUp(false);
    }
  };


  const handleFile = async (file: File) => {
    setFileName(file.name);
    setParsing(true);
    setRows(null);
    setFinished(false);
    setFailures([]);
    setDone(0);
    try {
      const text = await file.text();
      const result = await parseArtworkImportCsv(text);
      setRows(result.rows);
      setParseErrors(result.parseErrors);
    } finally {
      setParsing(false);
    }
  };

  const runImport = async (targetRows: NormalizedArtworkRow[]) => {
    setImporting(true);
    setDone(0);
    setRunTotal(targetRows.length);
    setFailures([]);
    // Sequential, not Promise.all — each row fetches and uploads an
    // external image, and running ~100 of those at once would hammer
    // both the source site and R2 for no real benefit, plus this gives
    // an honest, visible progress count rather than one long silent wait.
    // The extra pause between rows (on top of the retry-with-backoff
    // inside a single row's fetch) is deliberately gentle on the source
    // site — confirmed 2026-08-11 that enough rapid requests in a row
    // triggers what looks like temporary rate-limiting/blocking there.
    for (const row of targetRows) {
      const result = await importArtworkRow(artistId, siteId, row);
      if (!result.ok) {
        setFailures((prev) => [...prev, { row, error: result.error }]);
      }
      setDone((prev) => prev + 1);
      await new Promise((r) => setTimeout(r, 400));
    }
    setImporting(false);
    setFinished(true);
    router.refresh();
  };

  const handleStartImport = () => {
    if (!rows) return;
    runImport(rows);
  };

  const handleRetryFailed = () => {
    // Deliberately re-runs ONLY the rows that failed — re-running the
    // whole file again would create duplicate artworks for every one
    // that already succeeded, since imports don't check for existing
    // matches. This is why each failure keeps its own row, not just its
    // title/error.
    const retryRows = failures.map((f) => f.row);
    runImport(retryRows);
  };

  const priceless = rows?.filter((r) => r.price === null).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Import Artworks from CSV</h2>
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
              Choose a CSV export. Expected columns: Title, Image URL, Price, Dimensions, Medium,
              Location, Tier, Group, Type, Description, Sold, Notes.
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

            <div className="mt-4 rounded-md border border-red-200 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-red-400">
                Danger Zone
              </p>
              <p className="mb-2 text-xs text-neutral-500">
                Had a repeated or restarted import leave duplicates behind? This deletes every
                artwork this import feature has ever created for this artist, so you can re-run
                the CSV fresh. Never touches artworks added any other way.
              </p>
              <button
                type="button"
                onClick={handleCleanUp}
                disabled={cleaningUp}
                className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {cleaningUp ? "Checking…" : "Delete all CSV-imported artworks…"}
              </button>
            </div>
          </div>
        )}

        {parsing && <p className="text-sm text-neutral-500">Reading {fileName}…</p>}

        {rows && !importing && !finished && (
          <div>
            <p className="mb-2 text-sm text-neutral-700">
              <span className="font-medium">{fileName}</span> — {rows.length} artwork
              {rows.length === 1 ? "" : "s"} found.
            </p>
            {priceless > 0 && (
              <p className="mb-2 text-xs text-neutral-500">
                {priceless} of these have no price set (blank or "Enquire") — imported with no
                price, same as they'll show as price-on-enquiry.
              </p>
            )}
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
                  {r.title} {r.sold ? "— Sold" : ""}
                </p>
              ))}
              {rows.length > 8 && <p>…and {rows.length - 8} more</p>}
            </div>
            <p className="mb-4 text-xs text-neutral-400">
              This fetches each artwork's image individually and can take a few minutes for a
              large catalogue — keep this tab open until it finishes.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleStartImport}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
              >
                Import {rows.length} artwork{rows.length === 1 ? "" : "s"}
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
              {done} of {runTotal}
              {failures.length > 0 && `, ${failures.length} failed`}
            </p>
            <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full bg-neutral-900 transition-all"
                style={{ width: `${(done / runTotal) * 100}%` }}
              />
            </div>
            {failures.length > 0 && (
              <div className="mb-3 max-h-40 overflow-y-auto rounded-md bg-red-50 p-2 text-xs text-red-700">
                {failures.map((f, i) => (
                  <p key={i}>
                    <span className="font-medium">{f.row.title}:</span> {f.error}
                  </p>
                ))}
              </div>
            )}
            {finished && (
              <div className="flex gap-2">
                {failures.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRetryFailed}
                    className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
                  >
                    Retry {failures.length} failed
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
