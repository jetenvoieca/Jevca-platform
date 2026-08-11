"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  parseArtworkImportCsv,
  importArtworkRow,
  type NormalizedArtworkRow,
} from "@/lib/actions/artworkImport";

type Failure = { title: string; error: string };

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
  const [failures, setFailures] = useState<Failure[]>([]);
  const [finished, setFinished] = useState(false);
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
      const result = await parseArtworkImportCsv(text);
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
    setFailures([]);
    // Sequential, not Promise.all — each row fetches and uploads an
    // external image, and running ~100 of those at once would hammer
    // both the source site and R2 for no real benefit, plus this gives
    // an honest, visible progress count rather than one long silent wait.
    for (const row of rows) {
      const result = await importArtworkRow(artistId, siteId, row);
      if (!result.ok) {
        setFailures((prev) => [...prev, { title: row.title, error: result.error }]);
      }
      setDone((prev) => prev + 1);
    }
    setImporting(false);
    setFinished(true);
    router.refresh();
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
              {done} of {rows.length}
              {failures.length > 0 && `, ${failures.length} failed`}
            </p>
            <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full bg-neutral-900 transition-all"
                style={{ width: `${(done / rows.length) * 100}%` }}
              />
            </div>
            {failures.length > 0 && (
              <div className="mb-3 max-h-40 overflow-y-auto rounded-md bg-red-50 p-2 text-xs text-red-700">
                {failures.map((f, i) => (
                  <p key={i}>
                    <span className="font-medium">{f.title}:</span> {f.error}
                  </p>
                ))}
              </div>
            )}
            {finished && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
              >
                Done
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
