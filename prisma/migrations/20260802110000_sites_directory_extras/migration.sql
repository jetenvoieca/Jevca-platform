-- AlterEnum: add ISYT to SiteStatus
ALTER TYPE "SiteStatus" ADD VALUE 'ISYT';

-- AlterTable: Artist gains subscription/payment record-keeping fields
ALTER TABLE "Artist" ADD COLUMN "subscriptionAmount" DECIMAL(10,2);
ALTER TABLE "Artist" ADD COLUMN "paymentMethod" TEXT;

-- AlterTable: Site gains a placeholder Template field
ALTER TABLE "Site" ADD COLUMN "template" TEXT NOT NULL DEFAULT 'Default';
