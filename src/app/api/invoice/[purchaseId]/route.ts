import { NextRequest } from "next/server";
import { generateInvoicePdf } from "@/lib/actions/invoice";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ purchaseId: string }> }
) {
  const { purchaseId } = await params;

  // Defaults to "attachment" (a real download) — every existing caller
  // (Download invoice buttons in PurchasePanel, SaleDetailCard,
  // GalleriesView, etc.) keeps behaving exactly as before. The Invoice
  // tab in InvoiceEmailModal is the one caller that wants the PDF
  // rendered inline inside its <iframe> instead of triggering a browser
  // download the moment it opens — that's the only difference: same PDF,
  // same generateInvoicePdf call, just a different Content-Disposition
  // (2026-09-01, Part Three preview fix).
  const disposition = req.nextUrl.searchParams.get("disposition") === "inline" ? "inline" : "attachment";

  try {
    const { bytes, filename } = await generateInvoicePdf(purchaseId);
    // pdf-lib's return type is a Uint8Array<ArrayBufferLike>, which newer
    // TypeScript lib definitions no longer accept as a BlobPart directly
    // (ArrayBufferLike also covers SharedArrayBuffer, which Blob can't
    // take). Copying into a fresh Uint8Array guarantees a plain
    // ArrayBuffer underneath.
    const safeBytes = new Uint8Array(bytes);
    return new Response(new Blob([safeBytes]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
      },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Could not generate invoice", {
      status: 500,
    });
  }
}
