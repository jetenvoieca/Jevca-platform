-- Posting a social post through Zernio (2026-10-16).

-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN "zernioPostId" TEXT,
ADD COLUMN "permalink" TEXT,
ADD COLUMN "error" TEXT,
ADD COLUMN "postedAt" TIMESTAMP(3);
