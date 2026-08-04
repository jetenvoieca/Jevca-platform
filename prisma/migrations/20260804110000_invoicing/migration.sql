-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('STRIPE', 'GALLERY');

-- AlterTable: Artist gains invoicing identity fields
ALTER TABLE "Artist" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Artist" ADD COLUMN "invoiceAddress" TEXT;
ALTER TABLE "Artist" ADD COLUMN "vatNumber" TEXT;
ALTER TABLE "Artist" ADD COLUMN "vatRate" DECIMAL(5,2);
ALTER TABLE "Artist" ADD COLUMN "invoiceFooterText" TEXT;
ALTER TABLE "Artist" ADD COLUMN "nextInvoiceNumber" INTEGER NOT NULL DEFAULT 1;

-- AlterTable: Purchase gains channel + gallery-sale fields
ALTER TABLE "Purchase" ADD COLUMN "channel" "SaleChannel" NOT NULL DEFAULT 'STRIPE';
ALTER TABLE "Purchase" ADD COLUMN "buyerAddress" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "commissionPercent" DECIMAL(5,2);
ALTER TABLE "Purchase" ADD COLUMN "invoiceNumber" INTEGER;

-- AlterTable: buyerEmail is no longer required — a Gallery sale may not
-- always have one on file; the Stripe flow still enforces it in
-- application code (see startPurchase), this just relaxes the DB
-- constraint to accommodate the channel that doesn't need it.
ALTER TABLE "Purchase" ALTER COLUMN "buyerEmail" DROP NOT NULL;
