-- Site.template (free string, always "Default") replaced with a real
-- link to Template.
ALTER TABLE "Site" DROP COLUMN "template";
ALTER TABLE "Site" ADD COLUMN "templateId" TEXT;

-- CreateIndex
CREATE INDEX "Site_templateId_idx" ON "Site"("templateId");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum: TEMPLATE_STYLE added to PageType
ALTER TYPE "PageType" ADD VALUE 'TEMPLATE_STYLE';

-- AlterTable: which of the site's Template's page styles this page is
-- (set only when type = TEMPLATE_STYLE)
ALTER TABLE "Page" ADD COLUMN "templateStyle" "PageStyle";
