import { NextRequest } from "next/server";
import { generateCertificatePdf } from "@/lib/actions/certificate";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ purchaseId: string }> }
) {
  const { purchaseId } = await params;

  // Same ?disposition=inline convention as /api/invoice — defaults to a
  // real download; CertificateEmailModal's preview iframe is the one
  // caller that asks for inline instead.
  const disposition = req.nextUrl.searchParams.get("disposition") === "inline" ? "inline" : "attachment";

  try {
    const { bytes, filename } = await generateCertificatePdf(purchaseId);
    const safeBytes = new Uint8Array(bytes);
    return new Response(new Blob([safeBytes]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
      },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Could not generate the certificate", {
      status: 500,
    });
  }
}
