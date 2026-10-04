-- Pages made on the new Pages page don't use the old page editors, so
-- they have no old page type (2026-10-04).
ALTER TABLE "Page" ALTER COLUMN "type" DROP NOT NULL;

-- The curation a page shows (2026-10-04) — optional.
ALTER TABLE "Page" ADD COLUMN "curationId" TEXT;
CREATE INDEX "Page_curationId_idx" ON "Page"("curationId");
ALTER TABLE "Page" ADD CONSTRAINT "Page_curationId_fkey" FOREIGN KEY ("curationId") REFERENCES "Curation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
