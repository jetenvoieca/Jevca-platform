-- A page that opens another with its Contact panel slid open (2026-11-03,
-- the ISYT sites' "contact" menu item) — see Page.opensPageId.
ALTER TABLE "Page" ADD COLUMN "opensPageId" TEXT;
CREATE INDEX "Page_opensPageId_idx" ON "Page"("opensPageId");
ALTER TABLE "Page" ADD CONSTRAINT "Page_opensPageId_fkey" FOREIGN KEY ("opensPageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;
