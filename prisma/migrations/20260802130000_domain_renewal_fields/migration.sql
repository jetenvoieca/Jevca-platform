-- AlterTable: Site gains manual domain-renewal tracking fields
ALTER TABLE "Site" ADD COLUMN "domainStatus" TEXT;
ALTER TABLE "Site" ADD COLUMN "domainRenewalDate" TIMESTAMP(3);
ALTER TABLE "Site" ADD COLUMN "domainRenewalCost" DECIMAL(10,2);
