-- AlterTable: Personal Profile tab (2026-08-31) — a portrait/story photo
-- and free-text bio for the artist, separate from the invoicing logo.
ALTER TABLE "Artist" ADD COLUMN "profileImageUrl" TEXT;
ALTER TABLE "Artist" ADD COLUMN "story" TEXT;
