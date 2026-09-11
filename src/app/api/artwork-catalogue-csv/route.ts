import { NextRequest } from "next/server";
import { generateArtworkCatalogueCsv } from "@/lib/actions/artworkCatalogueCsv";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const artistId = params.get("artistId");
  if (!artistId) return new Response("Missing artistId", { status: 400 });

  try {
    const { csv, filename } = await generateArtworkCatalogueCsv(artistId, {
      q: params.get("q") || undefined,
      availability: params.get("availability") || undefined,
      location: params.get("location") || undefined,
      type: params.get("type") || undefined,
      group: params.get("group") || undefined,
      tier: params.get("tier") || undefined,
      sort: params.get("sort") || undefined,
    });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Could not generate the export", {
      status: 500,
    });
  }
}
