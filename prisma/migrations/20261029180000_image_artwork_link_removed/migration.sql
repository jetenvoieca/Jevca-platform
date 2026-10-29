-- A picture belongs to a work only as its one picture (2026-10-29):
-- Artwork.mainImageId is the one record of it. Image.artworkId only
-- repeated it (every picture still linked is a work's main picture, see
-- 20261028230000_artwork_main_image_only), so it's removed.
ALTER TABLE "Image" DROP CONSTRAINT "Image_artworkId_fkey";
DROP INDEX "Image_artworkId_idx";
ALTER TABLE "Image" DROP COLUMN "artworkId";
