import { NextRequest } from "next/server";
import { generateInvoicePdf } from "@/lib/actions/invoice";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ purchaseId: string }> }
) {
  const { purchaseId } = await params;

  try {
    const { bytes, filename } = await generateInvoicePdf(purchaseId);
    return new Response(bytes, {
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
