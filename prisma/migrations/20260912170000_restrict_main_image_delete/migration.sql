-- Fix (2026-09-12, direct bug report): deleting an Image that's still
-- set as an artwork's main image — or a video render's result image —
-- used to silently succeed and null out that reference, because both
-- FKs were left at Postgres's default action for an optional column
-- (SET NULL), not RESTRICT. This contradicted deleteImagePermanently's
-- own error handling (lib/actions/imageDelete.ts), which already
-- expected a delete in that situation to fail with "this image is
-- still linked elsewhere ... remove that link first" — it just never
-- actually did. Concretely: deleting a Related image in the Media
-- Catalogue that happened to also be that same artwork's chosen main
-- image silently wiped out the main image too, with no warning.
--
-- Changing these to RESTRICT makes the database actually enforce what
-- the app already believed it was enforcing — the delete now fails with
-- the existing friendly error message instead of silently succeeding.

ALTER TABLE "Artwork" DROP CONSTRAINT "Artwork_mainImageId_fkey";
ALTER TABLE "Artwork" ADD CONSTRAINT "Artwork_mainImageId_fkey" FOREIGN KEY ("mainImageId") REFERENCES "Image"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VideoRender" DROP CONSTRAINT "VideoRender_resultImageId_fkey";
ALTER TABLE "VideoRender" ADD CONSTRAINT "VideoRender_resultImageId_fkey" FOREIGN KEY ("resultImageId") REFERENCES "Image"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
