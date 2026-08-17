import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { generateArtworkCataloguePdf } from "@/lib/actions/artworkCataloguePdf";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const artistId = params.get("artistId");
  if (!artistId) return new Response("Missing artistId", { status: 400 });

  const artist = await db.artist.findUnique({ where: { id: artistId }, select: { name: true } });
  if (!artist) return new Response("Artist not found", { status: 404 });

  try {
    const { bytes, filename } = await generateArtworkCataloguePdf(artistId, artist.name, {
      q: params.get("q") || undefined,
      availability: params.get("availability") || undefined,
      location: params.get("location") || undefined,
      type: params.get("type") || undefined,
      group: params.get("group") || undefined,
      sort: params.get("sort") || undefined,
      // Editable per-export override (2026-08-17) — defaults to the
      // artist's real name / "Artwork Catalogue" when absent, same as
      // before this existed.
      headerTitle: params.get("headerTitle") || undefined,
      headerSubtitle: params.get("headerSubtitle") || undefined,
    });
    // Same ArrayBufferLike -> plain ArrayBuffer copy as the invoice route,
    // for the same TypeScript BlobPart reason.
    const safeBytes = new Uint8Array(bytes);
    return new Response(new Blob([safeBytes]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Could not generate the export", {
      status: 500,
    });
  }
}
