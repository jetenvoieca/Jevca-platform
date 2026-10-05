-- Removes the Pavilion page types (2026-10-05, direct request — replaced
-- by the Canvas page style). Pavilion pages, and the child pages they
-- created for each card (tagged sourceTag 'pavilion'), are deleted as
-- agreed; nothing else references a Page row. sourceTag was only ever
-- used for those child pages, so it goes too.
DELETE FROM "Page" WHERE "type" IN ('PAVILION', 'PAVILION_VISUAL') OR "sourceTag" = 'pavilion';

ALTER TABLE "Page" DROP COLUMN "sourceTag";

-- Postgres can't drop values from an enum, so PageType is rebuilt
-- without them.
ALTER TYPE "PageType" RENAME TO "PageType_old";
CREATE TYPE "PageType" AS ENUM ('SECTION', 'PRIVATE', 'TEMPLATE_STYLE');
ALTER TABLE "Page" ALTER COLUMN "type" TYPE "PageType" USING ("type"::text::"PageType");
ALTER TABLE "PageStyle" ALTER COLUMN "type" TYPE "PageType" USING ("type"::text::"PageType");
DROP TYPE "PageType_old";
