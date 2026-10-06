-- The menu a site uses, and a page's own menu in place of the site's
-- (2026-10-06) — both optional, cleared if the Menu Style is deleted.
ALTER TABLE "Site" ADD COLUMN "menuStyleId" TEXT;
CREATE INDEX "Site_menuStyleId_idx" ON "Site"("menuStyleId");
ALTER TABLE "Site" ADD CONSTRAINT "Site_menuStyleId_fkey" FOREIGN KEY ("menuStyleId") REFERENCES "MenuStyle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Page" ADD COLUMN "menuStyleId" TEXT;
CREATE INDEX "Page_menuStyleId_idx" ON "Page"("menuStyleId");
ALTER TABLE "Page" ADD CONSTRAINT "Page_menuStyleId_fkey" FOREIGN KEY ("menuStyleId") REFERENCES "MenuStyle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
