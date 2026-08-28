-- Ensure gen_random_uuid() is available for the one-off data migration
-- below (carrying existing Types across into real rows).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "ArtworkType" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "refValue" DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtworkType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArtworkType_artistId_idx" ON "ArtworkType"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "ArtworkType_artistId_name_key" ON "ArtworkType"("artistId", "name");

-- AddForeignKey
ALTER TABLE "ArtworkType" ADD CONSTRAINT "ArtworkType_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data migration: carry each artist's existing free-text Type list into
-- real ArtworkType rows, defaulting refValue to 1.00 (a neutral
-- multiplier — no adjustment either way) so nothing about the artist's
-- existing Reference/Offered price workflow can behave unexpectedly on
-- day one. Each one can then be tuned individually in Settings.
-- Artwork.type stays free text, matched by name against this new table,
-- so no existing artwork record needs to change.
INSERT INTO "ArtworkType" ("id", "artistId", "name", "refValue", "updatedAt")
SELECT gen_random_uuid()::text, "id", t, 1.00, CURRENT_TIMESTAMP
FROM "Artist", unnest("artworkTypes") AS t
ON CONFLICT ("artistId", "name") DO NOTHING;

-- AlterTable: new Catalogue/Presentation fields for the simplified
-- pricing model (2026-08-28) — see the matching comments in
-- schema.prisma for what each is for.
ALTER TABLE "Artwork" ADD COLUMN "offeredPrice" DECIMAL(10,2);
ALTER TABLE "Artwork" ADD COLUMN "presentationMedium" TEXT;
ALTER TABLE "Artwork" ADD COLUMN "viewingLocation" TEXT;
