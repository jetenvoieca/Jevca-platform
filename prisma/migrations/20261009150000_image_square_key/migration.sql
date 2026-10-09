-- A square version of a photo (2026-10-09), for campaign mail galleries
-- set to Regularise: cropped from the centre, made the first time it's
-- needed and kept. Cleared (and its file removed) when the photo is
-- cropped again or deleted.

-- AlterTable
ALTER TABLE "Image" ADD COLUMN "squareKey" TEXT;
