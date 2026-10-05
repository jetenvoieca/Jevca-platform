-- Where each curation sits on a Canvas page (2026-10-05). Positions are
-- canvas pixels from the top-left. Removed with its page or curation.
CREATE TABLE "PageCanvasItem" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "curationId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,

    CONSTRAINT "PageCanvasItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageCanvasItem_pageId_curationId_key" ON "PageCanvasItem"("pageId", "curationId");
CREATE INDEX "PageCanvasItem_curationId_idx" ON "PageCanvasItem"("curationId");

ALTER TABLE "PageCanvasItem" ADD CONSTRAINT "PageCanvasItem_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PageCanvasItem" ADD CONSTRAINT "PageCanvasItem_curationId_fkey" FOREIGN KEY ("curationId") REFERENCES "Curation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
