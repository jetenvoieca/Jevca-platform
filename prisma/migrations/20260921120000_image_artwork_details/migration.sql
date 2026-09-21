-- Adds Image.artworkSize, Image.artworkPrice and Image.artworkType — the
-- details the artist's own capture app (Studio) can attach to a photo
-- before it reaches the Hopper. Additive only — no existing column touched.
ALTER TABLE "Image" ADD COLUMN "artworkSize" TEXT;
ALTER TABLE "Image" ADD COLUMN "artworkPrice" DECIMAL(10,2);
ALTER TABLE "Image" ADD COLUMN "artworkType" TEXT;
