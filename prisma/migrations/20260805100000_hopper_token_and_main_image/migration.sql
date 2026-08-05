-- Artist.hopperToken: a private per-artist credential for the iPhone
-- Shortcut. Added nullable first, backfilled with a unique value for
-- every existing artist, then made NOT NULL + UNIQUE — Prisma's
-- @default(cuid()) only takes effect for rows created through Prisma
-- Client going forward, so existing rows need an explicit backfill here.
ALTER TABLE "Artist" ADD COLUMN "hopperToken" TEXT;

UPDATE "Artist"
SET "hopperToken" = md5(random()::text || clock_timestamp()::text || "id")
WHERE "hopperToken" IS NULL;

ALTER TABLE "Artist" ALTER COLUMN "hopperToken" SET NOT NULL;
CREATE UNIQUE INDEX "Artist_hopperToken_key" ON "Artist"("hopperToken");

-- Artwork.mainImageId: nullable by design (see schema.prisma comment) —
-- no backfill needed, every existing artwork simply starts with none set
-- and falls back to the pre-existing "earliest linked image" behaviour
-- wherever a representative thumbnail is needed.
ALTER TABLE "Artwork" ADD COLUMN "mainImageId" TEXT;
CREATE UNIQUE INDEX "Artwork_mainImageId_key" ON "Artwork"("mainImageId");
ALTER TABLE "Artwork" ADD CONSTRAINT "Artwork_mainImageId_fkey" FOREIGN KEY ("mainImageId") REFERENCES "Image"("id") ON DELETE SET NULL ON UPDATE CASCADE;
