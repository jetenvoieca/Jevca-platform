-- An artist's Stickers library (2026-10-16).

-- CreateTable
CREATE TABLE "Sticker" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sticker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sticker_artistId_idx" ON "Sticker"("artistId");

-- AddForeignKey
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
