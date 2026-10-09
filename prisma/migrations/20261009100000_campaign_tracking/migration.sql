-- Marketing → Mail Campaigns, tracking (2026-10-09, step 4a): what
-- happened to each campaign mail after it was sent (delivered, opened,
-- clicked, bounced, marked as spam), from Resend's webhook. A hard bounce
-- or a spam complaint stops all further mail to that subscriber.

-- AlterEnum
ALTER TYPE "SubscriberStatus" ADD VALUE 'BOUNCED';
ALTER TYPE "SubscriberStatus" ADD VALUE 'COMPLAINED';

-- AlterTable
ALTER TABLE "CampaignRecipient" ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "openedAt" TIMESTAMP(3),
ADD COLUMN "clickedAt" TIMESTAMP(3),
ADD COLUMN "bouncedAt" TIMESTAMP(3),
ADD COLUMN "bounceType" TEXT,
ADD COLUMN "complainedAt" TIMESTAMP(3);
