-- Tier and Group removed (2026-09-24, direct request). They were
-- display/marketing choices rather than facts about the artwork, and
-- are replaced by Curations (see migration 20260924170000_curations).
-- Existing values are deliberately dropped, not converted into
-- curations (direct decision — "drop them and start again").
ALTER TABLE "Artwork" DROP COLUMN "tier";
ALTER TABLE "Artwork" DROP COLUMN "catalogueGroup";
ALTER TABLE "Artwork" DROP COLUMN "presentationGroup";
ALTER TABLE "Artist" DROP COLUMN "artworkGroups";
ALTER TABLE "Artist" DROP COLUMN "artworkTiers";
