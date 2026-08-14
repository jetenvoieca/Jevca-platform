"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";

// Written to Louise Dear's actual export columns (confirmed 2026-08-14:
// "First Name", "Surname", "Email", "Phone", "Address") rather than
// assumed — if a future artist's export uses different column names,
// only the lookups below need adjusting, same convention as the artwork
// CSV import.

export type NormalizedCustomerRow = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
};

export async function parseCustomerImportCsv(
  csvText: string
): Promise<{ rows: NormalizedCustomerRow[]; parseErrors: string[] }> {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const parseErrors = result.errors.map((e) => `Row ${e.row ?? "?"}: ${e.message}`);

  const rows: NormalizedCustomerRow[] = result.data
    .map((r) => ({
      firstName: (r["First Name"] || "").trim(),
      lastName: (r["Surname"] || r["Last Name"] || "").trim(),
      email: (r["Email"] || "").trim(),
      phone: (r["Phone"] || "").trim(),
      address: (r["Address"] || "").trim(),
    }))
    // A row needs at least a name to be worth anything — silently
    // skipped rather than surfaced as an error, since a genuinely blank
    // row (trailing newline, etc.) isn't a data problem to flag.
    .filter((r) => r.firstName || r.lastName);

  return { rows, parseErrors };
}

export type ImportCustomerRowResult =
  | { outcome: "created" }
  | { outcome: "merged" }
  | { outcome: "skipped"; reason: string };

// One row at a time, called in a loop from the client (2026-08-14) —
// matching the artwork import's shape even though there's no per-row
// network call here that could time out, so the same progress-bar
// pattern in the UI works identically for both without needing two
// different mental models.
//
// Merge, not skip-or-duplicate, on an email match: an existing contact
// (e.g. one already created via a real sale) keeps everything it
// already has — this only fills in fields that are still blank. A row
// with no email always creates a new contact, since there's nothing
// reliable to match it against.
export async function importCustomerRow(
  artistId: string,
  row: NormalizedCustomerRow
): Promise<ImportCustomerRowResult> {
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ");
  if (!name) return { outcome: "skipped", reason: "No name." };

  if (row.email) {
    const existing = await db.customer.findFirst({
      where: { artistId, email: { equals: row.email, mode: "insensitive" } },
    });
    if (existing) {
      await db.customer.update({
        where: { id: existing.id },
        data: {
          firstName: existing.firstName || row.firstName || null,
          lastName: existing.lastName || row.lastName || null,
          phone: existing.phone || row.phone || null,
          address: existing.address || row.address || null,
        },
      });
      return { outcome: "merged" };
    }
  }

  await db.customer.create({
    data: {
      artistId,
      kind: "INDIVIDUAL",
      name,
      firstName: row.firstName || null,
      lastName: row.lastName || null,
      email: row.email || null,
      phone: row.phone || null,
      address: row.address || null,
    },
  });
  revalidatePath(`/sites`);
  return { outcome: "created" };
}
