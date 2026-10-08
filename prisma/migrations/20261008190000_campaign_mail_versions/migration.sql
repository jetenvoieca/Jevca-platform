-- Marketing → Mail Campaigns (2026-10-08): a campaign's alternative
-- mails (up to 2, each sent to a share of the audience) and its
-- follow-up mail, and the template each mail started from.

-- AlterEnum
ALTER TYPE "CampaignMailKind" ADD VALUE 'ALTERNATIVE';
ALTER TYPE "CampaignMailKind" ADD VALUE 'FOLLOW_UP';

-- CreateEnum
CREATE TYPE "FollowUpCondition" AS ENUM ('NOT_OPENED', 'OPENED', 'CLICKED', 'NOT_CLICKED');

-- AlterTable
ALTER TABLE "CampaignMail" ADD COLUMN "templateId" TEXT,
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "sharePercent" INTEGER,
ADD COLUMN "followUpCondition" "FollowUpCondition",
ADD COLUMN "followUpDays" INTEGER;

-- CreateIndex
CREATE INDEX "CampaignMail_templateId_idx" ON "CampaignMail"("templateId");

-- AddForeignKey
ALTER TABLE "CampaignMail" ADD CONSTRAINT "CampaignMail_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
