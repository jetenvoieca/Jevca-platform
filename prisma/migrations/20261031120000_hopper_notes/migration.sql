-- Hopper notes (2026-10-31): text sent from the Studio app's Instructions
-- screen to the client's Hopper — see HopperNote in schema.prisma.
CREATE TABLE "HopperNote" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HopperNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HopperNote_artistId_createdAt_idx" ON "HopperNote"("artistId", "createdAt");

ALTER TABLE "HopperNote" ADD CONSTRAINT "HopperNote_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
