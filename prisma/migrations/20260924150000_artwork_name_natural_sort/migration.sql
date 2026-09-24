-- Natural A–Z sorting for artwork names (2026-09-24). The database's
-- default collation sorts by raw character code, so a lowercase or
-- accented first letter ("été", "the…") lands after every capital Z.
-- "und-x-icu" is Postgres's built-in, language-neutral ICU collation:
-- it sorts ignoring case and accents, and stays deterministic, so
-- equality checks and existing indexes behave exactly as before. Used
-- by buildArtworkOrderBy (src/lib/artworkFilters.ts). Not expressed in
-- schema.prisma — Prisma has no attribute for column collation.
ALTER TABLE "Artwork" ALTER COLUMN "catalogueName" TYPE TEXT COLLATE "und-x-icu";
