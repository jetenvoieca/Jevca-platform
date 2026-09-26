-- The currency of each artwork's price (see Artwork.priceCurrency).
ALTER TABLE "Artwork" ADD COLUMN "priceCurrency" TEXT NOT NULL DEFAULT 'GBP';

-- Existing artworks take their artist's default currency: the currency of
-- the artist's first website that isn't archived, when that is EUR
-- (anything else stays GBP) — the same rule as getArtistDefaultCurrency.
UPDATE "Artwork" a
SET "priceCurrency" = 'EUR'
WHERE (
  SELECT s."defaultCurrency"
  FROM "Site" s
  WHERE s."artistId" = a."artistId" AND s."status" <> 'ARCHIVED'
  ORDER BY s."createdAt" ASC
  LIMIT 1
) = 'EUR';
