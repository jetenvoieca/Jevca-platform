-- Curations (2026-09-24) — a named, ordered selection of an artist's
-- artworks. See the note on Curation in schema.prisma.

-- CreateTable
CREATE TABLE "Curation" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Curation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurationItem" (
    "id" TEXT NOT NULL,
    "curationId" TEXT NOT NULL,
    "artworkId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Curation_artistId_name_key" ON "Curation"("artistId", "name");
CREATE INDEX "Curation_artistId_idx" ON "Curation"("artistId");
CREATE UNIQUE INDEX "CurationItem_curationId_artworkId_key" ON "CurationItem"("curationId", "artworkId");
CREATE INDEX "CurationItem_curationId_position_idx" ON "CurationItem"("curationId", "position");
CREATE INDEX "CurationItem_artworkId_idx" ON "CurationItem"("artworkId");

-- AddForeignKey
ALTER TABLE "Curation" ADD CONSTRAINT "Curation_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CurationItem" ADD CONSTRAINT "CurationItem_curationId_fkey" FOREIGN KEY ("curationId") REFERENCES "Curation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CurationItem" ADD CONSTRAINT "CurationItem_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "Artwork"("id") ON DELETE CASCADE ON UPDATE CASCADE;
