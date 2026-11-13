-- Concierge (2026-11-13, Craig's mockup): "Rearrange artworks on a page"
-- can say which page; Administration → Concierge opens on it.
ALTER TABLE "HopperNote" ADD COLUMN "pageId" TEXT;
ALTER TABLE "HopperNote" ADD CONSTRAINT "HopperNote_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;
