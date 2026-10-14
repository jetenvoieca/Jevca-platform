import { NextRequest } from "next/server";
import { generateInvoicePdf } from "@/lib/actions/invoice";

// An invoice's PDF (or receipt, once paid) — see generateInvoicePdf.
// Defaults to "attachment" (a real download); the invoice window's
// preview asks for ?disposition=inline so the browser shows the PDF
// inside its <iframe> instead — same PDF, so what's previewed is exactly
// what's emailed.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const { invoiceId } = await params;
  const disposition = req.nextUrl.searchParams.get("disposition") === "inline" ? "inline" : "attachment";

  try {
    const { bytes, filename } = await generateInvoicePdf(invoiceId);
    // pdf-lib returns a Uint8Array<ArrayBufferLike>, which newer
    // TypeScript lib definitions don't accept as a BlobPart (it could be
    // a SharedArrayBuffer); copying gives a plain ArrayBuffer underneath.
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
