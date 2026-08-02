"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importNamecheapDomains, type NamecheapImportRow } from "@/lib/actions/namecheap";

// Namecheap-fetching scripts have varied between attempts/projects — field
// names and date formats seen so far: expires vs expiry, ISO vs
// MM/DD/YYYY, a status field vs none at all (autoRenew instead). Rather
// than assume one exact shape (and silently apply nothing if it doesn't
// match, as happened once already), this normalizes whatever's actually
// in the file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeRow(raw: any): NamecheapImportRow | null {
  const name = raw.name || raw.domain;
  if (!name) return null;

  const rawDate: string = raw.expires || raw.expiry || raw.expiryDate || "";
  let isoExpiry = "";
  if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
    isoExpiry = rawDate.slice(0, 10);
  } else {
    const m = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // MM/DD/YYYY
    if (m) isoExpiry = `${m[3]}-${m[1]}-${m[2]}`;
  }

  let status: string = raw.status || "";
  if (!status) {
    // No explicit status in this file — derive one from the expiry date
    // itself (autoRenew, if present, doesn't actually indicate whether a
    // domain is close to expiring, so it's not used here).
    if (raw.isExpired === true || raw.isExpired === "true") {
      status = "Expired";
    } else if (isoExpiry) {
      const daysUntil = (new Date(isoExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      status = daysUntil <= 30 ? "Expiring soon" : "Active";
    } else {
      status = "Active";
    }
  }

  return { name, expires: isoExpiry, status };
}

export default function NamecheapImportForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ matched: number; unmatched: string[] } | null>(null);
  const router = useRouter();

  const handleFile = (file: File) => {
    setError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      let rows: NamecheapImportRow[];
      try {
        const parsed = JSON.parse(reader.result as string);
        const raw = Array.isArray(parsed) ? parsed : parsed.domains;
        if (!Array.isArray(raw)) throw new Error("not an array");
        rows = raw.map(normalizeRow).filter((r): r is NamecheapImportRow => r !== null);
      } catch {
        setError("That doesn't look like a valid namecheap-domains.json file.");
        return;
      }
      startTransition(async () => {
        const res = await importNamecheapDomains(rows);
        setResult(res);
        router.refresh();
      });
    };
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsText(file);
  };

  return (
    <div className="max-w-xl rounded-lg border border-neutral-200 p-5">
      <label className="mb-2 block text-sm font-medium text-neutral-700">
        Import namecheap-domains.json
      </label>
      <input
        type="file"
        accept="application/json"
        disabled={isPending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="mb-3 block w-full text-sm disabled:opacity-50"
      />

      {isPending && <p className="text-sm text-neutral-500">Applying…</p>}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-2 space-y-2 text-sm">
          <p className="text-green-600">
            Updated {result.matched} site{result.matched === 1 ? "" : "s"}.
          </p>
          {result.unmatched.length > 0 && (
            <div>
              <p className="text-neutral-500">
                {result.unmatched.length} domain{result.unmatched.length === 1 ? "" : "s"} from the
                file didn&apos;t match any Site (not in the Studio yet, or the domain differs
                slightly):
              </p>
              <ul className="mt-1 list-disc pl-5 text-neutral-500">
                {result.unmatched.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-neutral-400">
        Run <code>node scripts/fetch-domains.js</code> on your own computer first (see the script
        for setup) — it never runs on the server, so your Namecheap API key never leaves your
        machine.
      </p>
    </div>
  );
}
