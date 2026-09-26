import { NextRequest, NextResponse } from "next/server";
import { isCurrency } from "@/lib/currencies";
import { isValidAmount, optionalText, readStudioRequest, text } from "@/lib/studioRequest";
import { consignStudioArtwork } from "@/lib/studioArtworks";

// Consigns one of the artist's artworks to one of their Locations, at the
// price and currency agreed there (and, for an edition, with the edition
// number set on the Consign screen). Authenticated by the artist's personal
// token.
export async function POST(request: NextRequest) {
  const req = await readStudioRequest(request);
  if ("response" in req) return req.response;
  const { artist, fields } = req;

  const artworkId = text(fields.artworkId);
  const location = text(fields.location);
  const price = text(fields.price);
  const currency = text(fields.currency);

  if (!artworkId || !location) {
    return NextResponse.json({ error: "artworkId and location are required." }, { status: 400 });
  }
  if (!isValidAmount(price)) {
    return NextResponse.json({ error: "Price must be a number above 0." }, { status: 400 });
  }
  if (!isCurrency(currency)) {
    return NextResponse.json({ error: "Currency must be GBP or EUR." }, { status: 400 });
  }

  const result = await consignStudioArtwork(artist.id, {
    artworkId,
    location,
    price,
    currency,
    edition: optionalText(fields.edition),
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
