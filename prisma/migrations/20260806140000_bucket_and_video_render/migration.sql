-- AlterEnum: add BUCKET to ImageStatus (the Video Editor's staging area)
ALTER TYPE "ImageStatus" ADD VALUE 'BUCKET';

-- CreateEnum
CREATE TYPE "VideoRenderStatus" AS ENUM ('PENDING', 'RENDERING', 'DONE', 'FAILED');

-- CreateTable: tracks one Shotstack render job — see bucket-video-editor-design.md
CREATE TABLE "VideoRender" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "name" TEXT,
    "status" "VideoRenderStatus" NOT NULL DEFAULT 'PENDING',
    "shotstackRenderId" TEXT,
    "resultImageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoRender_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VideoRender_resultImageId_key" ON "VideoRender"("resultImageId");
CREATE INDEX "VideoRender_artistId_idx" ON "VideoRender"("artistId");

ALTER TABLE "VideoRender" ADD CONSTRAINT "VideoRender_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VideoRender" ADD CONSTRAINT "VideoRender_resultImageId_fkey" FOREIGN KEY ("resultImageId") REFERENCES "Image"("id") ON DELETE SET NULL ON UPDATE CASCADE;
