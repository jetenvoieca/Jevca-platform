"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  parseHopperImportCsv,
  importHopperCsvRow,
  getHopperVideoImports,
  type NormalizedHopperImportRow,
} from "@/lib/actions/hopperImport";
import { withTimeout } from "@/lib/importHelpers";
import { useBackdropClose } from "@/lib/useBackdropClose";

type Failure = { row: NormalizedHopperImportRow; error: string };

export default function HopperImportPanel({
  artistId,
  siteId,
  onClose,
}: {
  artistId: string;
  siteId: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<NormalizedHopperImportRow[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(0);
  const [runTotal, setRunTotal] = useState(0);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [finished, setFinished] = useState(false);
  // Videos being copied in the background (2026-10-15), by import id —
  // see lib/hopperVideoImport.ts. The import is only finished once each
  // has landed in the Hopper or failed.
  const [copying, setCopying] = useState<Map<string, NormalizedHopperImportRow>>(new Map());
  // A backdrop click closes it, except while an import is running —
  // the same rule as the Close button, which is hidden then.
  const backdrop = useBackdropClose(() => {
    if (!importing) onClose();
  });
  const router = useRouter();

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setParsing(true);
    setRows(null);
    setFinished(false);
    setFailures([]);
    setDone(0);
    try {
      const text = await file.text();
      const result = await parseHopperImportCsv(text);
      setRows(result.rows);
      setParseErrors(result.parseErrors);
    } finally {
      setParsing(false);
    }
  };

  // Sequential, not Promise.all — same reasoning as the Artwork import:
  // each row fetches an external image, and an honest, visible progress
  // count matters more here than raw speed. The gentle pause between
  // rows is deliberately kind to whatever's hosting the source images.
  //
  // Each row wrapped in its own try/catch (2026-08-17 fix) — without
  // this, any exception thrown by the row itself (not just the clean
  // { ok: false } failure path) broke out of the whole loop and left
  // the dialog stuck showing "Importing… N of M" forever, since
  // setImporting(false) was only ever reached after the loop finished
  // normally. Confirmed real, not just theoretical: a single row can
  // take up to roughly a minute in the worst case (fetchAndUploadImage's
  // three retries, each with its own 20-second timeout, plus backoff
  // between them) — comfortably longer than Netlify Functions' default
  // execution limit, so a genuinely slow or unresponsive source image
  // host can get that row's function killed by the platform mid-request
  // rather than returning a clean error. Now that's just one more
  // recorded failure, same as any other — the rest of the batch keeps
  // going and it shows up in the Retry-failed list like any other row.
  const runImport = async (targetRows: NormalizedHopperImportRow[]) => {
    setImporting(true);
    setDone(0);
    setRunTotal(targetRows.length);
    setFailures([]);
    for (const row of targetRows) {
      try {
        const result = await withTimeout(
          importHopperCsvRow(artistId, siteId, row),
          35000,
          "Timed out after 35s — the source may be slow or unresponsive. Try again."
        );
        if (!result.ok) {
          setFailures((prev) => [...prev, { row, error: result.error }]);
        } else if (result.videoImportId) {
          const id = result.videoImportId;
          setCopying((prev) => new Map(prev).set(id, row));
        }
      } catch (err) {
        setFailures((prev) => [
          ...prev,
          {
            row,
            error:
              err instanceof Error
                ? err.message
                : "Something went wrong fetching this file (possibly a slow/unresponsive source — try again).",
          },
        ]);
      }
      setDone((prev) => prev + 1);
      await new Promise((r) => setTimeout(r, 400));
    }
    setImporting(false);
    setFinished(true);
    router.refresh();
  };

  // Checks on the videos still copying every few seconds until each has
  // landed or failed.
  useEffect(() => {
    if (copying.size === 0) return;
    const timer = setInterval(async () => {
      const states = await getHopperVideoImports(artistId, Array.from(copying.keys()));
      const settled = states.filter((s) => s.status !== "COPYING");
      if (settled.length === 0) return;
      setFailures((prev) => [
        ...prev,
        ...settled
          .filter((s) => s.status === "FAILED")
          .map((s) => ({ row: copying.get(s.id)!, error: s.error || "Could not copy the video." })),
      ]);
      setCopying((prev) => {
        const next = new Map(prev);
        settled.forEach((s) => next.delete(s.id));
        return next;
      });
      router.refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [copying, artistId, router]);

  const handleStartImport = () => {
    if (!rows) return;
    runImport(rows);
  };

  const handleRetryFailed = () => {
    const retryRows = failures.map((f) => f.row);
    runImport(retryRows);
  };

  const untitled = rows?.filter((r) => !r.title).length ?? 0;
  const allDone = finished && copying.size === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" {...backdrop}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Import into Hopper from CSV</h2>
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
              Choose a CSV. Expected columns: Image URL or Video URL (required — one per row),
              Title (optional — used as the starting caption). Every other detail — Type, Price,
              Group, and so on — gets filled in later while sorting each item, same as any other
              Hopper item.
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
              <span className="font-medium">{fileName}</span> — {rows.length} item
              {rows.length === 1 ? "" : "s"} found.
            </p>
            {untitled > 0 && (
              <p className="mb-2 text-xs text-neutral-500">
                {untitled} of these have no Title column — imported with a blank caption,
                same as a plain file upload.
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
                  {r.title || "(no title)"}
                </p>
              ))}
              {rows.length > 8 && <p>…and {rows.length - 8} more</p>}
            </div>
            <p className="mb-4 text-xs text-neutral-400">
              This fetches each item individually and can take a few minutes for a large file —
              keep this tab open until it finishes. Videos are copied in the background and can
              take a little longer to appear.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleStartImport}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
              >
                Import {rows.length} item{rows.length === 1 ? "" : "s"}
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
              {allDone ? "Done — " : "Importing… "}
              {done} of {runTotal}
              {failures.length > 0 && `, ${failures.length} failed`}
            </p>
            {copying.size > 0 && (
              <p className="mb-2 text-xs text-neutral-500">
                Copying {copying.size} video{copying.size === 1 ? "" : "s"} in the background…
              </p>
            )}
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
                    <span className="font-medium">{f.row.title || f.row.url}:</span>{" "}
                    {f.error}
                  </p>
                ))}
              </div>
            )}
            {allDone && (
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
