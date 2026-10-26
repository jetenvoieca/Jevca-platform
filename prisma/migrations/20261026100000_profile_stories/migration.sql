-- The Profile Catalogue (2026-10-26) — see ProfileStory in schema.prisma.
CREATE TABLE "ProfileStory" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "imageId" TEXT,
    "caption" TEXT NOT NULL DEFAULT '',
    "story" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProfileStory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProfileStory_artistId_position_idx" ON "ProfileStory"("artistId", "position");
CREATE INDEX "ProfileStory_imageId_idx" ON "ProfileStory"("imageId");
ALTER TABLE "ProfileStory" ADD CONSTRAINT "ProfileStory_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileStory" ADD CONSTRAINT "ProfileStory_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE SET NULL ON UPDATE CASCADE;
