import type { PDFDocument, PDFFont, PDFImage } from "pdf-lib";
import { APP_URL } from "@/lib/appUrl";

// Pieces shared by the documents made with pdf-lib — invoices and
// receipts (lib/actions/invoice.ts) and statements (lib/statementPdf.ts).

export function currencySymbol(currency: string) {
  return currency === "EUR" ? "€" : currency === "USD" ? "$" : "£";
}

// The artist's printed address from their structured fields (2026-09-06)
// — addressLine1 can itself be more than one line, followed by city, then
// postcode + country on one line. Blank fields are skipped.
export function addressLines(artist: {
  addressLine1: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
}): string[] {
  const lines = [
    ...(artist.addressLine1 || "").split("\n").map((l) => l.trim()).filter(Boolean),
    artist.city?.trim() || null,
    [artist.postcode?.trim(), artist.country?.trim()].filter(Boolean).join(", ") || null,
  ];
  return lines.filter((l): l is string => !!l);
}

// Shortens text to fit a width, ending in "…".
export function fitText(text: string, maxWidth: number, font: PDFFont, size: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

// The artist's logo, embedded — or null if there isn't one or it can't be
// fetched or read (the document is made without it rather than failing
// over a decorative image).
export async function embedLogo(doc: PDFDocument, logoUrl: string | null): Promise<PDFImage | null> {
  if (!logoUrl) return null;
  try {
    const url = logoUrl.startsWith("http") ? logoUrl : `${APP_URL}${logoUrl}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "";
    return contentType.includes("png") ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}
