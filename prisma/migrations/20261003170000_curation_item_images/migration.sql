-- Curation images (2026-10-03) — each work in a curation can have its
-- own image set (main + up to 3), separate from the Catalogue's. See the
-- notes on CurationItem.ownImages and CurationItemImage in schema.prisma.
-- Every existing work keeps showing the Catalogue's images (ownImages
-- false) until its images are changed on the Curations page.

-- AlterTable
ALTER TABLE "CurationItem" ADD COLUMN "ownImages" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CurationItemImage" (
    "id" TEXT NOT NULL,
    "curationItemId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CurationItemImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CurationItemImage_curationItemId_imageId_key" ON "CurationItemImage"("curationItemId", "imageId");
CREATE INDEX "CurationItemImage_curationItemId_position_idx" ON "CurationItemImage"("curationItemId", "position");
CREATE INDEX "CurationItemImage_imageId_idx" ON "CurationItemImage"("imageId");

-- AddForeignKey
ALTER TABLE "CurationItemImage" ADD CONSTRAINT "CurationItemImage_curationItemId_fkey" FOREIGN KEY ("curationItemId") REFERENCES "CurationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CurationItemImage" ADD CONSTRAINT "CurationItemImage_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE CASCADE ON UPDATE CASCADE;
