-- Image (the Media Catalogue) moves from belonging to a Site to belonging
-- to an Artist, same reasoning and pattern as the Artwork migration:
-- the same media can be relevant across more than one of that artist's
-- sites, so it shouldn't be tied to just one.

ALTER TABLE "Image" ADD COLUMN "artistId" TEXT;

UPDATE "Image" i
SET "artistId" = s."artistId"
FROM "Site" s
WHERE i."siteId" = s.id;

ALTER TABLE "Image" ALTER COLUMN "artistId" SET NOT NULL;

DROP INDEX "Image_siteId_idx";
CREATE INDEX "Image_artistId_idx" ON "Image"("artistId");

ALTER TABLE "Image" DROP CONSTRAINT "Image_siteId_fkey";
ALTER TABLE "Image" ADD CONSTRAINT "Image_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Image" DROP COLUMN "siteId";

-- Preset tag list for the Media Catalogue's Settings screen.
ALTER TABLE "Artist" ADD COLUMN "mediaTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
