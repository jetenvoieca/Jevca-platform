-- What fills each component of a Private / Custom page (2026-10-07):
-- one of the page's curation's sections, or (sectionId null) the
-- curation's works. One per component. See PageComponentContent in
-- schema.prisma.
CREATE TABLE "PageComponentContent" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "sectionId" TEXT,

    CONSTRAINT "PageComponentContent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageComponentContent_pageId_blockId_key" ON "PageComponentContent"("pageId", "blockId");

CREATE INDEX "PageComponentContent_sectionId_idx" ON "PageComponentContent"("sectionId");

ALTER TABLE "PageComponentContent" ADD CONSTRAINT "PageComponentContent_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PageComponentContent" ADD CONSTRAINT "PageComponentContent_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CurationSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
