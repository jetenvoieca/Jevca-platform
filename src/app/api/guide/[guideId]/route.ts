import { NextRequest } from "next/server";
import { generateGuidePdf } from "@/lib/actions/guidePdf";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ guideId: string }> }
) {
  const { guideId } = await params;

  try {
    const { bytes, filename } = await generateGuidePdf(guideId);
    const safeBytes = new Uint8Array(bytes);
    return new Response(new Blob([safeBytes]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Could not generate the guide PDF", {
      status: 500,
    });
  }
}
