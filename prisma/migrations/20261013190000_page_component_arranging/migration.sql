-- Pages bring curations and Page Styles together (2026-10-13, Craig's
-- mockup). What fills a component now says where it comes from
-- (`source`): the curation's works, one of its sections, or text typed on
-- the page (a Header). A Description can be edited for one page (`text`,
-- null = the curation's own). Works and Supporting Images can be removed
-- (`hiddenIds`) and put in another order (`orderIds`) on one page.
CREATE TYPE "PageContentSource" AS ENUM ('WORKS', 'SECTION', 'TYPED');

ALTER TABLE "PageComponentContent"
  ADD COLUMN "source" "PageContentSource",
  ADD COLUMN "text" TEXT,
  ADD COLUMN "hiddenIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "orderIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "PageComponentContent"
SET "source" = CASE WHEN "sectionId" IS NULL THEN 'WORKS'::"PageContentSource" ELSE 'SECTION'::"PageContentSource" END;

ALTER TABLE "PageComponentContent" ALTER COLUMN "source" SET NOT NULL;
