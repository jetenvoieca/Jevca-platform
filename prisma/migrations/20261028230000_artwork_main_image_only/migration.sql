-- The Catalogue keeps one picture per work (2026-10-28, Craig: the
-- Catalogue is a plain record of the works; other pictures belong to
-- curations' presentations). Nothing is deleted.
--
-- 1. A work with pictures but no Main gets its earliest picture (a
--    photo, not a video) as Main — what it was showing already.
UPDATE "Artwork" a
SET "mainImageId" = (
  SELECT i."id" FROM "Image" i
  WHERE i."artworkId" = a."id" AND i."kind" = 'PHOTO'
    AND NOT EXISTS (SELECT 1 FROM "Artwork" o WHERE o."mainImageId" = i."id")
  ORDER BY i."createdAt" ASC
  LIMIT 1
)
WHERE a."mainImageId" IS NULL
  AND EXISTS (SELECT 1 FROM "Image" i WHERE i."artworkId" = a."id" AND i."kind" = 'PHOTO');

-- 2. Every other picture is taken off its work. It stays in the Media
--    Catalogue, and in any curation that chose it for its presentation.
UPDATE "Image" i
SET "artworkId" = NULL
WHERE i."artworkId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Artwork" a WHERE a."mainImageId" = i."id");
