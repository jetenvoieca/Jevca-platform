-- The old page editors and the Site Templates library are removed
-- (2026-10-07, Craig's request); pages are built from Page Styles only.
-- The Private / Custom Style Type is renamed Block Build.

-- Site Templates: the site's Template, then the library itself.
ALTER TABLE "Site" DROP CONSTRAINT "Site_templateId_fkey";
DROP INDEX "Site_templateId_idx";
ALTER TABLE "Site" DROP COLUMN "templateId";
DROP TABLE "TemplatePage";
DROP TABLE "Template";

-- The old page editors' columns on Page.
ALTER TABLE "Page" DROP CONSTRAINT "Page_backgroundImageId_fkey";
DROP INDEX "Page_backgroundImageId_idx";
ALTER TABLE "Page" DROP COLUMN "backgroundImageId";
ALTER TABLE "Page" DROP COLUMN "backgroundColor";
ALTER TABLE "Page" DROP COLUMN "templateStyle";
ALTER TABLE "Page" DROP COLUMN "draftBlocks";
ALTER TABLE "Page" DROP COLUMN "type";
DROP TYPE "TemplatePageStyle";

-- PageType is now only a Page Style's Style Type: PageStyleType, with
-- PRIVATE renamed BLOCK_BUILD. (Section styles were deleted by
-- 20261007180000_remove_section_page_styles.)
CREATE TYPE "PageStyleType" AS ENUM ('BLOCK_BUILD', 'CANVAS');
ALTER TABLE "PageStyle" ALTER COLUMN "type" TYPE "PageStyleType"
  USING (CASE "type"::text WHEN 'PRIVATE' THEN 'BLOCK_BUILD' ELSE "type"::text END)::"PageStyleType";
DROP TYPE "PageType";
