-- A page can sit under another in the menu (2026-10-25) — see
-- Page.parentId.
ALTER TABLE "Page" ADD COLUMN "parentId" TEXT;
CREATE INDEX "Page_parentId_idx" ON "Page"("parentId");
ALTER TABLE "Page" ADD CONSTRAINT "Page_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;
