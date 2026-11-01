-- Base works (2026-11-01): an artwork others are derived from — see
-- Artwork.isBase in schema.prisma.
ALTER TABLE "Artwork" ADD COLUMN "isBase" BOOLEAN NOT NULL DEFAULT false;
