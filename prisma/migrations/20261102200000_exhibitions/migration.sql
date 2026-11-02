-- The Exhibitions catalogue (2026-11-02, Craig's mockup) — see Exhibition
-- and ExhibitionImage in schema.prisma.
CREATE TABLE "Exhibition" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "locationId" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "openingTimes" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exhibition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExhibitionImage" (
    "id" TEXT NOT NULL,
    "exhibitionId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ExhibitionImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Exhibition_artistId_startDate_idx" ON "Exhibition"("artistId", "startDate");
CREATE INDEX "Exhibition_locationId_idx" ON "Exhibition"("locationId");
CREATE UNIQUE INDEX "ExhibitionImage_exhibitionId_imageId_key" ON "ExhibitionImage"("exhibitionId", "imageId");
CREATE INDEX "ExhibitionImage_exhibitionId_position_idx" ON "ExhibitionImage"("exhibitionId", "position");
CREATE INDEX "ExhibitionImage_imageId_idx" ON "ExhibitionImage"("imageId");

ALTER TABLE "Exhibition" ADD CONSTRAINT "Exhibition_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Exhibition" ADD CONSTRAINT "Exhibition_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExhibitionImage" ADD CONSTRAINT "ExhibitionImage_exhibitionId_fkey" FOREIGN KEY ("exhibitionId") REFERENCES "Exhibition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExhibitionImage" ADD CONSTRAINT "ExhibitionImage_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE CASCADE ON UPDATE CASCADE;
