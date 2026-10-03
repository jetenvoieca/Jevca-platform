-- Curation presentation (2026-10-03) — each work in a curation has its
-- own Description, so the same artwork can read differently in each
-- curation. See the note on CurationItem.description in schema.prisma.
ALTER TABLE "CurationItem" ADD COLUMN "description" TEXT;

-- Works already in a curation get the same starting text a newly added
-- work gets: the artwork's Type, Medium and Size, one per line, skipping
-- any that are blank.
UPDATE "CurationItem" AS ci
SET "description" = NULLIF(
  concat_ws(
    E'\n',
    NULLIF(btrim(a."type"), ''),
    NULLIF(btrim(a."medium"), ''),
    NULLIF(btrim(a."size"), '')
  ),
  ''
)
FROM "Artwork" AS a
WHERE a."id" = ci."artworkId";
