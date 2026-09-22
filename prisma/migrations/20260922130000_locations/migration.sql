-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('GALLERY', 'OWN');

-- Ensure gen_random_uuid() is available for the backfill below (same
-- guard already used in the 20260828120000 migration).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL DEFAULT 'OWN',
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Location_customerId_key" ON "Location"("customerId");
CREATE UNIQUE INDEX "Location_artistId_name_key" ON "Location"("artistId", "name");
CREATE INDEX "Location_artistId_idx" ON "Location"("artistId");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Location" ADD CONSTRAINT "Location_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill 1: every existing Gallery becomes a GALLERY-type Location,
-- reusing its own Customer record for contact/commission/consignment
-- data — nothing about that record changes.
INSERT INTO "Location" ("id", "artistId", "name", "type", "customerId", "updatedAt")
SELECT gen_random_uuid()::text, c."artistId", c."name", 'GALLERY', c."id", CURRENT_TIMESTAMP
FROM "Customer" c
WHERE c."kind" = 'GALLERY';

-- Backfill 2: every distinct free-text Artwork.location value not
-- already covered by a Gallery above (e.g. "The Studio", or a location
-- whose name doesn't exactly match any Gallery's — see the note on
-- Location in schema.prisma) gets its own new Customer (kind 'OWN')
-- plus a matching OWN-type Location. Two steps via a temp table, since
-- a single INSERT can't drive a second one off its own generated ids.
CREATE TEMP TABLE "_new_own_locations" AS
SELECT gen_random_uuid()::text AS id, a."artistId" AS "artistId", a."location" AS name
FROM (
  SELECT DISTINCT "artistId", "location"
  FROM "Artwork"
  WHERE "location" IS NOT NULL AND "location" != ''
) a
WHERE NOT EXISTS (
  SELECT 1 FROM "Location" l WHERE l."artistId" = a."artistId" AND l."name" = a."location"
);

INSERT INTO "Customer" ("id", "artistId", "kind", "name", "updatedAt")
SELECT n.id, n."artistId", 'OWN', n.name, CURRENT_TIMESTAMP FROM "_new_own_locations" n;

INSERT INTO "Location" ("id", "artistId", "name", "type", "customerId", "updatedAt")
SELECT gen_random_uuid()::text, n."artistId", n.name, 'OWN', n.id, CURRENT_TIMESTAMP FROM "_new_own_locations" n;

DROP TABLE "_new_own_locations";

-- Backfill 3: any Settings-list Location preset never actually used on
-- an artwork, but still meant to be pickable, likewise becomes its own
-- Own-type Location + Customer, so nothing an artist already typed into
-- Settings silently disappears from the new dropdown.
CREATE TEMP TABLE "_new_own_locations2" AS
SELECT gen_random_uuid()::text AS id, ar."id" AS "artistId", v AS name
FROM "Artist" ar, unnest(ar."artworkLocations") v
WHERE NOT EXISTS (
  SELECT 1 FROM "Location" l WHERE l."artistId" = ar."id" AND l."name" = v
);

INSERT INTO "Customer" ("id", "artistId", "kind", "name", "updatedAt")
SELECT n.id, n."artistId", 'OWN', n.name, CURRENT_TIMESTAMP FROM "_new_own_locations2" n;

INSERT INTO "Location" ("id", "artistId", "name", "type", "customerId", "updatedAt")
SELECT gen_random_uuid()::text, n."artistId", n.name, 'OWN', n.id, CURRENT_TIMESTAMP FROM "_new_own_locations2" n;

DROP TABLE "_new_own_locations2";
