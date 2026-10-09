-- Marketing → Mail Campaigns, follow-up sending (2026-10-09, step 4c):
-- the follow-up mail goes N days after the campaign finished sending,
-- to those who did (or didn't) open or click it. A subscriber now has a
-- recipient row for the campaign's mail and one for its follow-up, so a
-- row is unique per mail, not per campaign.

-- DropIndex
DROP INDEX "CampaignRecipient_campaignId_subscriberId_key";

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_mailId_subscriberId_key" ON "CampaignRecipient"("mailId", "subscriberId");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_idx" ON "CampaignRecipient"("campaignId");

-- AlterTable
ALTER TABLE "CampaignMail" ADD COLUMN "followUpStartedAt" TIMESTAMP(3),
ADD COLUMN "followUpSentAt" TIMESTAMP(3),
ADD COLUMN "followUpError" TEXT;
