-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'INDIVIDUAL';
ALTER TABLE "Customer" ADD COLUMN "contactName" TEXT;
ALTER TABLE "Customer" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "Customer" ADD COLUMN "websiteName" TEXT;
ALTER TABLE "Customer" ADD COLUMN "websiteUrl" TEXT;
ALTER TABLE "Customer" ADD COLUMN "instagramUrl" TEXT;
ALTER TABLE "Customer" ADD COLUMN "facebookUrl" TEXT;
ALTER TABLE "Customer" ADD COLUMN "defaultCommissionPercent" DECIMAL(5,2);
