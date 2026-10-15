-- Videos in the Hopper's CSV import (2026-10-15): each video is copied
-- by a background function; this tracks the copy.

-- CreateEnum
CREATE TYPE "HopperVideoImportStatus" AS ENUM ('COPYING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "HopperVideoImport" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT,
    "key" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" "HopperVideoImportStatus" NOT NULL DEFAULT 'COPYING',
    "error" TEXT,
    "imageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HopperVideoImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HopperVideoImport_artistId_idx" ON "HopperVideoImport"("artistId");

-- AddForeignKey
ALTER TABLE "HopperVideoImport" ADD CONSTRAINT "HopperVideoImport_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
