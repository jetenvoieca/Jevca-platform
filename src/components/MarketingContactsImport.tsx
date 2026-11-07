"use client";

import { useState } from "react";
import Papa from "papaparse";
import { importMarketingContacts } from "@/lib/actions/marketingContacts";
import {
  IMPORT_COLUMNS,
  WORKS_LABEL,
  contactFromCsv,
  type MarketingImportResult,
  type MarketingImportRow,
} from "@/lib/marketingContacts";
import FormModal from "@/components/FormModal";
import { inputCls, labelCls, secondaryButtonCls } from "@/components/subscriberFormParts";

// Contacts → Import (2026-11-06, Craig's request): choose a CSV laid out
// as the template (IMPORT_COLUMNS), optionally name a tag to give every
// row (e.g. "Louise Dear"), check the preview, then import. A
// contact already there (same type, matched by email, or by website when
// one has no email) keeps what it has — its blanks are filled and the
// row's works and tags added; see importMarketingContacts.

const BATCH = 100;
const PREVIEW = 8;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The template: the headings and one example row.
function downloadTemplate() {
  const example = {
    Type: "Gallery",
    Name: "Example Gallery",
    "Contact person": "",
    Email: "info@example.com",
    Phone: "",
    Website: "https://example.com",
    Shop: "https://example.com/shop",
    Photo: "https://example.com/images/gallery-interior.jpg",
    Instagram: "",
    TikTok: "",
    Town: "London",
    Country: "United Kingdom",
    "Originals from": "2000",
    "Originals to": "15000",
    "Prints from": "150",
    "Prints to": "950",
    Currency: "GBP",
    Works: "Originals; Prints",
    Tags: "",
    Notes: "",
  };
  const csv = Papa.unparse({ fields: [...IMPORT_COLUMNS], data: [IMPORT_COLUMNS.map((c) => example[c])] });
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "contacts-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function MarketingContactsImport({
  tagNames,
  onImported,
  onClose,
}: {
  // Tags already in use, to suggest.
  tagNames: string[];
  // After an import, so the list can be reloaded.
  onImported: () => void;
  onClose: () => void;
}) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<MarketingImportRow[] | null>(null);
  const [fileProblem, setFileProblem] = useState("");
  const [tagAll, setTagAll] = useState("");
  const [done, setDone] = useState<number | null>(null);
  const [result, setResult] = useState<MarketingImportResult | null>(null);
  const importing = done !== null && !result;

  const read = async (file: File) => {
    setFileName(file.name);
    setFileProblem("");
    const parsed = Papa.parse<Record<string, string>>(await file.text(), { header: true });
    // Line 1 is the headings; blank lines are passed over but still
    // counted, so the line numbers match the file.
    const found = parsed.data.flatMap((record, i) =>
      Object.values(record).some((v) => v?.trim()) ? [{ line: i + 2, contact: contactFromCsv(record) }] : [],
    );
    if (found.length === 0) setFileProblem("No contacts found in that file.");
    setRows(found.length ? found : null);
  };

  const start = async () => {
    if (!rows) return;
    const tag = tagAll.trim();
    const withTag = rows.map((r) =>
      tag && !r.contact.tags.some((t) => t.name.toLowerCase() === tag.toLowerCase())
        ? { ...r, contact: { ...r.contact, tags: [...r.contact.tags, { id: null, name: tag }] } }
        : r,
    );
    const total: MarketingImportResult = { created: 0, merged: 0, skipped: [] };
    setDone(0);
    for (let i = 0; i < withTag.length; i += BATCH) {
      const batch = await importMarketingContacts(withTag.slice(i, i + BATCH));
      total.created += batch.created;
      total.merged += batch.merged;
      total.skipped.push(...batch.skipped);
      setDone(Math.min(i + BATCH, withTag.length));
    }
    setResult(total);
    onImported();
  };

  return (
    <FormModal title="Import contacts" busy={importing} onClose={onClose}>
      {result ? (
        <div className="space-y-2 text-sm text-neutral-700">
          <p>
            {plural(result.created, "contact")} added, {plural(result.merged, "contact")} already there updated
            {result.skipped.length > 0 && `, ${plural(result.skipped.length, "row")} skipped`}.
          </p>
          {result.skipped.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-md bg-amber-50 p-2 text-xs text-amber-800">
              {result.skipped.map((s) => (
                <p key={s.line}>
                  Line {s.line}: {s.reason}
                </p>
              ))}
            </div>
          )}
          <button type="button" onClick={onClose} className={secondaryButtonCls}>
            Done
          </button>
        </div>
      ) : importing ? (
        <p className="text-sm text-neutral-700">
          Importing… {done} of {rows!.length}
        </p>
      ) : (
        <>
          <p className="text-sm text-neutral-500">
            A CSV laid out as the template. A contact already here — matched by email, or by website when one has no email — keeps what it
            has: only its blanks are filled, and the row&apos;s works and tags are added.
          </p>
          <button type="button" onClick={downloadTemplate} className={secondaryButtonCls}>
            Download template
          </button>
          <div>
            <label className={labelCls}>CSV file</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) read(file);
              }}
              className="text-sm"
            />
            {fileProblem && <p className="mt-1 text-xs text-red-600">{fileProblem}</p>}
          </div>
          <div>
            <label className={labelCls}>Tag every row (optional)</label>
            <input
              type="text"
              list="import-tags"
              value={tagAll}
              onChange={(e) => setTagAll(e.target.value)}
              placeholder="e.g. Louise Dear"
              className={inputCls}
            />
            <datalist id="import-tags">
              {tagNames.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          {rows && (
            <>
              <p className="text-sm text-neutral-700">
                <span className="font-medium">{fileName}</span> — {plural(rows.length, "row")}.
              </p>
              <div className="max-h-48 overflow-y-auto rounded-md border border-neutral-200 p-2 text-xs text-neutral-600">
                {rows.slice(0, PREVIEW).map(({ line, contact: c }) => (
                  <p key={line} className="truncate">
                    {c.name || <span className="text-red-600">no name</span>}
                    {c.email && ` — ${c.email}`}
                    {c.worksTypes.length > 0 && ` — ${c.worksTypes.map((w) => WORKS_LABEL[w]).join(", ")}`}
                  </p>
                ))}
                {rows.length > PREVIEW && <p>…and {rows.length - PREVIEW} more</p>}
              </div>
              <button
                type="button"
                onClick={start}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
              >
                Import {plural(rows.length, "row")}
              </button>
            </>
          )}
        </>
      )}
    </FormModal>
  );
}
