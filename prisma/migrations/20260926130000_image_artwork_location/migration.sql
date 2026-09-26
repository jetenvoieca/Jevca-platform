-- Where the artwork is, as sent from the Studio app with a Hopper photo
-- (see Image.artworkLocation).
ALTER TABLE "Image" ADD COLUMN "artworkLocation" TEXT;
