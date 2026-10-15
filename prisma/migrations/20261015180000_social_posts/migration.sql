-- Marketing → Social Media (2026-10-15): social posts and their media.

-- CreateEnum
CREATE TYPE "SocialPostFormat" AS ENUM ('POST', 'STORY');

-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'POSTING', 'POSTED', 'FAILED');

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "format" "SocialPostFormat" NOT NULL DEFAULT 'POST',
    "caption" TEXT NOT NULL DEFAULT '',
    "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPostMedia" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "SocialPostMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialPost_artistId_status_idx" ON "SocialPost"("artistId", "status");

-- CreateIndex
CREATE INDEX "SocialPostMedia_postId_idx" ON "SocialPostMedia"("postId");

-- CreateIndex
CREATE INDEX "SocialPostMedia_imageId_idx" ON "SocialPostMedia"("imageId");

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostMedia" ADD CONSTRAINT "SocialPostMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostMedia" ADD CONSTRAINT "SocialPostMedia_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE CASCADE ON UPDATE CASCADE;
