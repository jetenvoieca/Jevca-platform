-- Rename existing public-facing columns to make room for the Catalogue facet.
-- These become the Presentation facet's Title and Price.
ALTER TABLE "Artwork" RENAME COLUMN "title" TO "presentationTitle";
ALTER TABLE "Artwork" RENAME COLUMN "price" TO "presentationPrice";

-- New Presentation-facet column
ALTER TABLE "Artwork" ADD COLUMN "presentationGroup" TEXT;

-- New Catalogue-facet columns
ALTER TABLE "Artwork" ADD COLUMN "catalogueName" TEXT;
ALTER TABLE "Artwork" ADD COLUMN "type" TEXT;
ALTER TABLE "Artwork" ADD COLUMN "catalogueGroup" TEXT;
ALTER TABLE "Artwork" ADD COLUMN "size" TEXT;
ALTER TABLE "Artwork" ADD COLUMN "location" TEXT;
ALTER TABLE "Artwork" ADD COLUMN "edition" TEXT;
ALTER TABLE "Artwork" ADD COLUMN "availableQty" INTEGER;
ALTER TABLE "Artwork" ADD COLUMN "priceUnframed" DECIMAL(10,2);
ALTER TABLE "Artwork" ADD COLUMN "priceFramed" DECIMAL(10,2);
ALTER TABLE "Artwork" ADD COLUMN "studioNotes" TEXT;

-- Backfill: any artworks that already exist get their Catalogue facet seeded
-- from their current Presentation values — the same one-time "seed at
-- creation" rule the design calls for, applied retroactively so nothing
-- looks blank for artworks created before this split existed.
UPDATE "Artwork" SET "catalogueName" = "presentationTitle" WHERE "catalogueName" IS NULL;
UPDATE "Artwork" SET "size" = "dimensions" WHERE "size" IS NULL AND "dimensions" IS NOT NULL;
UPDATE "Artwork" SET "priceUnframed" = "presentationPrice" WHERE "priceUnframed" IS NULL AND "presentationPrice" IS NOT NULL;

-- catalogueName is required going forward, now that every row has one
ALTER TABLE "Artwork" ALTER COLUMN "catalogueName" SET NOT NULL;
