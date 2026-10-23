-- The artist's Facebook page (2026-10-23), shown with their Instagram
-- under a Side list menu. Louise Dear's is the one on louisedear.com.
ALTER TABLE "Artist" ADD COLUMN "facebookUrl" TEXT;

UPDATE "Artist" SET "facebookUrl" = 'https://www.facebook.com/share/18EqGxBfyA/' WHERE "name" = 'Louise Dear';
