-- Marketing → Mail Campaigns, sending (2026-10-08): a campaign's
-- status and send time, the mail lists it goes to, and one row per
-- recipient (which mail they get, in which language, and whether it
-- went).

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "scheduledAt" TIMESTAMP(3),
ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "sentAt" TIMESTAMP(3),
ADD COLUMN "sendError" TEXT;

-- CreateTable
CREATE TABLE "CampaignList" (
    "campaignId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,

    CONSTRAINT "CampaignList_pkey" PRIMARY KEY ("campaignId","listId")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "mailId" TEXT NOT NULL,
    "subscriberId" TEXT,
    "email" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "resendEmailId" TEXT,
    "error" TEXT,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_status_scheduledAt_idx" ON "Campaign"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "CampaignList_listId_idx" ON "CampaignList"("listId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_subscriberId_key" ON "CampaignRecipient"("campaignId", "subscriberId");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_status_idx" ON "CampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CampaignRecipient_mailId_idx" ON "CampaignRecipient"("mailId");

-- CreateIndex
CREATE INDEX "CampaignRecipient_subscriberId_idx" ON "CampaignRecipient"("subscriberId");

-- CreateIndex
CREATE INDEX "CampaignRecipient_resendEmailId_idx" ON "CampaignRecipient"("resendEmailId");

-- AddForeignKey
ALTER TABLE "CampaignList" ADD CONSTRAINT "CampaignList_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignList" ADD CONSTRAINT "CampaignList_listId_fkey" FOREIGN KEY ("listId") REFERENCES "MailList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_mailId_fkey" FOREIGN KEY ("mailId") REFERENCES "CampaignMail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
