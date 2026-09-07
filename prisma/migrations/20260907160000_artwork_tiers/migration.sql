-- AlterTable: Settings-editable list offered in the new Tier dropdown
-- on the Catalogue tab (2026-09-07) -- same free-text-preset pattern as
-- artworkGroups/artworkLocations/mediumPresets/sizePresets. Prefilled
-- for every existing artist with the three values seen in the original
-- CSV import (see Artwork.tier, added 2026-08-11), so nobody starts
-- with an empty list.
ALTER TABLE "Artist" ADD COLUMN "artworkTiers" TEXT[] NOT NULL DEFAULT ARRAY['Statement', 'Signature', 'Collectible']::TEXT[];
