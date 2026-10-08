-- Marketing → Mail Campaigns (2026-10-08): campaigns and their mails.

-- CreateEnum
CREATE TYPE "CampaignMailKind" AS ENUM ('PRINCIPAL');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMail" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" "CampaignMailKind" NOT NULL DEFAULT 'PRINCIPAL',
    "layout" JSONB NOT NULL DEFAULT '{}',
    "content" JSONB NOT NULL DEFAULT '{}',
    "subjectEn" TEXT,
    "subjectFr" TEXT,
    "previewEn" TEXT,
    "previewFr" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignMail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_siteId_name_key" ON "Campaign"("siteId", "name");

-- CreateIndex
CREATE INDEX "CampaignMail_campaignId_idx" ON "CampaignMail"("campaignId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMail" ADD CONSTRAINT "CampaignMail_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
