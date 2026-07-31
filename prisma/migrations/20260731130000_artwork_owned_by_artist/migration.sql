-- Artwork moves from belonging to a Site to belonging to an Artist, since
-- the same artwork can be featured on more than one of that artist's sites.

-- 1. Add the new column (nullable for now, until it's backfilled).
ALTER TABLE "Artwork" ADD COLUMN "artistId" TEXT;

-- 2. Backfill from each artwork's current site's owning artist.
UPDATE "Artwork" a
SET "artistId" = s."artistId"
FROM "Site" s
WHERE a."siteId" = s.id;

-- 3. Catalogue numbers used to only need to be unique per site. If an
-- artist has more than one site, two artworks on different sites could
-- both be "AW-0001" — now that numbering is per-artist, resolve any such
-- collisions by suffixing the later-created one before the new constraint
-- is added.
WITH ranked AS (
  SELECT id, "artistId", "catalogueNumber",
         ROW_NUMBER() OVER (
           PARTITION BY "artistId", "catalogueNumber" ORDER BY "createdAt"
         ) AS rn
  FROM "Artwork"
)
UPDATE "Artwork" a
SET "catalogueNumber" = a."catalogueNumber" || '-' || ranked.rn
FROM ranked
WHERE a.id = ranked.id AND ranked.rn > 1;

-- 4. artistId is required going forward.
ALTER TABLE "Artwork" ALTER COLUMN "artistId" SET NOT NULL;

-- 5. Swap the old site-scoped unique index/index for artist-scoped ones.
DROP INDEX "Artwork_siteId_catalogueNumber_key";
DROP INDEX "Artwork_siteId_idx";
CREATE UNIQUE INDEX "Artwork_artistId_catalogueNumber_key" ON "Artwork"("artistId", "catalogueNumber");
CREATE INDEX "Artwork_artistId_idx" ON "Artwork"("artistId");

-- 6. Point the foreign key at Artist instead of Site.
ALTER TABLE "Artwork" DROP CONSTRAINT "Artwork_siteId_fkey";
ALTER TABLE "Artwork" ADD CONSTRAINT "Artwork_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Drop the now-unused siteId column.
ALTER TABLE "Artwork" DROP COLUMN "siteId";

-- The five Settings preset lists move from Site to Artist for the same
-- reason. Add them on Artist first (empty by default)...
ALTER TABLE "Artist" ADD COLUMN "artworkGroups" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Artist" ADD COLUMN "artworkTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Artist" ADD COLUMN "artworkLocations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Artist" ADD COLUMN "mediumPresets" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Artist" ADD COLUMN "sizePresets" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ...then merge each artist's sites' existing lists up into it
-- (deduplicated, since more than one site could have the same entry).
UPDATE "Artist" a
SET
  "artworkGroups" = COALESCE((
    SELECT array_agg(DISTINCT v) FROM "Site" s, unnest(s."artworkGroups") v WHERE s."artistId" = a.id
  ), ARRAY[]::TEXT[]),
  "artworkTypes" = COALESCE((
    SELECT array_agg(DISTINCT v) FROM "Site" s, unnest(s."artworkTypes") v WHERE s."artistId" = a.id
  ), ARRAY[]::TEXT[]),
  "artworkLocations" = COALESCE((
    SELECT array_agg(DISTINCT v) FROM "Site" s, unnest(s."artworkLocations") v WHERE s."artistId" = a.id
  ), ARRAY[]::TEXT[]),
  "mediumPresets" = COALESCE((
    SELECT array_agg(DISTINCT v) FROM "Site" s, unnest(s."mediumPresets") v WHERE s."artistId" = a.id
  ), ARRAY[]::TEXT[]),
  "sizePresets" = COALESCE((
    SELECT array_agg(DISTINCT v) FROM "Site" s, unnest(s."sizePresets") v WHERE s."artistId" = a.id
  ), ARRAY[]::TEXT[]);

-- Now drop the old Site-level columns.
ALTER TABLE "Site" DROP COLUMN "artworkGroups";
ALTER TABLE "Site" DROP COLUMN "artworkTypes";
ALTER TABLE "Site" DROP COLUMN "artworkLocations";
ALTER TABLE "Site" DROP COLUMN "mediumPresets";
ALTER TABLE "Site" DROP COLUMN "sizePresets";
