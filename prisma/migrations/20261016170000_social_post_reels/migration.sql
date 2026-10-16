-- Reels as their own kind of social post (2026-10-16).

-- AlterEnum
ALTER TYPE "SocialPostFormat" ADD VALUE 'REEL';

-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN "reelInFeed" BOOLEAN NOT NULL DEFAULT true;
