import { NextRequest } from "next/server";
import { generateStatementPdf } from "@/lib/statementPdf";

// A statement's PDF (2026-10-20) — see generateStatementPdf. Same as the
// invoice route: a download by default, ?disposition=inline for the
// statement window's preview, so what's previewed is what's emailed.
export async function GET(req: NextRequest, { params }: { params: Promise<{ statementId: string }> }) {
  const { statementId } = await params;
  const disposition = req.nextUrl.searchParams.get("disposition") === "inline" ? "inline" : "attachment";
  try {
    const { bytes, filename } = await generateStatementPdf(statementId);
    return new Response(new Blob([new Uint8Array(bytes)]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
      },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Could not generate statement", { status: 500 });
  }
}
