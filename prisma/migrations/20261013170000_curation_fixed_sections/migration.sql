-- Curations always have exactly three presentation sections (2026-10-13,
-- Craig's mockup): Description, Video and Supporting Images, one each, in
-- that fixed order. Tag line and Free text are removed; extra sections of
-- the same type are removed (no curation is live yet). Order now comes
-- from the type, so `position` and Free text's `heading` go.

-- Remove Tag line and Free text sections (their media and page
-- component content go with them, by cascade).
DELETE FROM "CurationSection" WHERE "type" IN ('TAGLINE', 'TEXT');

-- Keep the first section of each type per curation.
DELETE FROM "CurationSection" s
USING (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "curationId", "type"
           ORDER BY "position", "createdAt", "id"
         ) AS rn
  FROM "CurationSection"
) ranked
WHERE s."id" = ranked."id" AND ranked.rn > 1;

-- The type list without Tag line and Free text, in display order.
ALTER TYPE "CurationSectionType" RENAME TO "CurationSectionType_old";
CREATE TYPE "CurationSectionType" AS ENUM ('DESCRIPTION', 'VIDEO', 'IMAGES');
ALTER TABLE "CurationSection"
  ALTER COLUMN "type" TYPE "CurationSectionType" USING ("type"::text::"CurationSectionType");
DROP TYPE "CurationSectionType_old";

DROP INDEX "CurationSection_curationId_position_idx";
ALTER TABLE "CurationSection" DROP COLUMN "position";
ALTER TABLE "CurationSection" DROP COLUMN "heading";

CREATE UNIQUE INDEX "CurationSection_curationId_type_key" ON "CurationSection"("curationId", "type");

-- Give every curation any of the three it's missing.
INSERT INTO "CurationSection" ("id", "curationId", "type", "updatedAt")
SELECT 'cs' || md5(random()::text || c."id" || t."type"::text), c."id", t."type", CURRENT_TIMESTAMP
FROM "Curation" c
CROSS JOIN (SELECT unnest(enum_range(NULL::"CurationSectionType")) AS "type") t
ON CONFLICT ("curationId", "type") DO NOTHING;
