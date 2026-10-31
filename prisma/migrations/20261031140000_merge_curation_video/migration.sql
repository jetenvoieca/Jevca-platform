-- One media grid per curation (2026-10-31, Craig's request): each
-- curation's Video moves to the front of its Supporting Media (unless it's
-- already there), and the separate Video section goes — with the page
-- Video component, which nothing used. See CurationSectionType.

-- Make room at the front of Supporting Media for the video.
UPDATE "CurationSectionMedia" m
SET "position" = m."position" + 1
FROM "CurationSection" s, "CurationSection" v, "CurationSectionMedia" vm
WHERE m."sectionId" = s."id"
  AND s."type" = 'IMAGES'
  AND v."curationId" = s."curationId"
  AND v."type" = 'VIDEO'
  AND vm."sectionId" = v."id"
  AND NOT EXISTS (
    SELECT 1 FROM "CurationSectionMedia" x WHERE x."sectionId" = s."id" AND x."imageId" = vm."imageId"
  );

INSERT INTO "CurationSectionMedia" ("id", "sectionId", "imageId", "position")
SELECT gen_random_uuid()::text, s."id", vm."imageId", 0
FROM "CurationSectionMedia" vm
JOIN "CurationSection" v ON v."id" = vm."sectionId" AND v."type" = 'VIDEO'
JOIN "CurationSection" s ON s."curationId" = v."curationId" AND s."type" = 'IMAGES'
WHERE NOT EXISTS (
  SELECT 1 FROM "CurationSectionMedia" x WHERE x."sectionId" = s."id" AND x."imageId" = vm."imageId"
);

-- The Video sections, with their media and any page component holding them.
DELETE FROM "CurationSection" WHERE "type" = 'VIDEO';

ALTER TYPE "CurationSectionType" RENAME TO "CurationSectionType_old";
CREATE TYPE "CurationSectionType" AS ENUM ('DESCRIPTION', 'IMAGES');
ALTER TABLE "CurationSection"
  ALTER COLUMN "type" TYPE "CurationSectionType" USING ("type"::text::"CurationSectionType");
DROP TYPE "CurationSectionType_old";
