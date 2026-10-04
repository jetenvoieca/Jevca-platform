-- Page Styles (2026-10-04): named page layouts shared by every site.
CREATE TABLE "PageStyle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PageType" NOT NULL,
    "layout" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageStyle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageStyle_name_key" ON "PageStyle"("name");

-- The Page Style a page is displayed with — optional.
ALTER TABLE "Page" ADD COLUMN "pageStyleId" TEXT;
CREATE INDEX "Page_pageStyleId_idx" ON "Page"("pageStyleId");
ALTER TABLE "Page" ADD CONSTRAINT "Page_pageStyleId_fkey" FOREIGN KEY ("pageStyleId") REFERENCES "PageStyle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
