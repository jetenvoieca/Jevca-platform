-- AlterTable: rename Artwork.year (Int) to Artwork.date (Text)
-- (2026-09-07, alongside unifying the Catalogue/Hopper forms) — artists
-- write this loosely (e.g. "June 2025"), which a plain Int never really
-- fit; renamed to `date` at the same time to match the field's actual
-- meaning, since it was never a bare calendar year in practice. Existing
-- numeric values are preserved as their text representation.
ALTER TABLE "Artwork" RENAME COLUMN "year" TO "date";
ALTER TABLE "Artwork" ALTER COLUMN "date" TYPE TEXT USING "date"::text;
