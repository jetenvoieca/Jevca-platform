"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type NamecheapImportRow = {
  name: string;
  expires: string; // ISO date string, or empty
  status: string; // "Active" | "Expiring soon" | "Expired"
};

export type NamecheapImportResult = {
  matched: number;
  unmatched: string[];
};

// Matches each imported domain against a Site's `domain` field and applies
// the status/renewal date — nothing else on the Site is touched. Domains
// that don't match any Site are reported back rather than silently
// dropped, so nothing goes missing without you knowing.
export async function importNamecheapDomains(
  rows: NamecheapImportRow[]
): Promise<NamecheapImportResult> {
  const sites = await db.site.findMany({ select: { id: true, domain: true } });

  // Same normalisation already applied when a domain is saved elsewhere in
  // the app (see updateSite) — strips protocol/www/trailing slash — so
  // matching is reliable regardless of how either side happens to be
  // formatted.
  const normalize = (d: string) =>
    d
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/$/, "");

  const byDomain = new Map(
    sites.filter((s) => s.domain).map((s) => [normalize(s.domain as string), s.id])
  );

  let matched = 0;
  const unmatched: string[] = [];

  for (const row of rows) {
    const siteId = byDomain.get(normalize(row.name));
    if (!siteId) {
      unmatched.push(row.name);
      continue;
    }
    await db.site.update({
      where: { id: siteId },
      data: {
        domainStatus: row.status || null,
        domainRenewalDate: row.expires ? new Date(row.expires) : null,
      },
    });
    matched++;
  }

  revalidatePath("/");
  return { matched, unmatched };
}
