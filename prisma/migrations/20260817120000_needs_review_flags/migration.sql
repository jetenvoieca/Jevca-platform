-- AlterTable
ALTER TABLE "Artwork" ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Image" ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false;
