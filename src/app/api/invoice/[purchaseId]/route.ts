import { NextRequest } from "next/server";
import { generateInvoicePdf } from "@/lib/actions/invoice";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ purchaseId: string }> }
) {
  const { purchaseId } = await params;

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
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Could not generate invoice", {
      status: 500,
    });
  }
}
