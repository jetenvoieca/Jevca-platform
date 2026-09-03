-- AlterTable: page-level background styling (2026-09-03) — colour plus
-- an optional relation to an existing Image, matching the columns added
-- to prisma/schema.prisma in the previous commit.
ALTER TABLE "Page" ADD COLUMN "backgroundColor" TEXT;
ALTER TABLE "Page" ADD COLUMN "backgroundImageId" TEXT;

-- CreateIndex
CREATE INDEX "Page_backgroundImageId_idx" ON "Page"("backgroundImageId");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_backgroundImageId_fkey" FOREIGN KEY ("backgroundImageId") REFERENCES "Image"("id") ON DELETE SET NULL ON UPDATE CASCADE;
