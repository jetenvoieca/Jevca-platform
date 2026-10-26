-- Details the browser importer reads from an artist's old website
-- (2026-10-26) — see the note on Image.artworkMedium.
ALTER TABLE "Image" ADD COLUMN "artworkMedium" TEXT;
ALTER TABLE "Image" ADD COLUMN "artworkEdition" TEXT;
ALTER TABLE "Image" ADD COLUMN "artworkSold" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Image" ADD COLUMN "artworkViewingLocation" TEXT;
ALTER TABLE "Image" ADD COLUMN "artworkPortfolio" TEXT;
ALTER TABLE "Image" ADD COLUMN "sourceUrl" TEXT;
CREATE INDEX "Image_artistId_sourceUrl_idx" ON "Image"("artistId", "sourceUrl");
