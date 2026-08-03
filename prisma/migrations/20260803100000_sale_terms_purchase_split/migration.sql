-- This restructures Payments from a single PaymentPlan (which mixed
-- artwork-level pricing with buyer/purchase-specific state) into two
-- things: SaleTerms (the artwork's own pricing, no buyer info) and
-- Purchase (a specific, real sale attempt, snapshotting terms at the
-- time it started). Existing PaymentPlan/Payment rows are test data from
-- building/testing the Stripe integration — dropped rather than migrated,
-- per explicit confirmation.

-- DropForeignKey / DropTable: old shape
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_planId_fkey";
DROP TABLE IF EXISTS "Payment";
DROP TABLE IF EXISTS "PaymentPlan";
DROP TYPE IF EXISTS "PaymentPlanType";

-- CreateEnum
CREATE TYPE "PurchaseType" AS ENUM ('FULL', 'INSTALMENTS');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "SaleTerms" (
    "id" TEXT NOT NULL,
    "artworkId" TEXT NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "instalmentCount" INTEGER NOT NULL DEFAULT 5,
    "releaseMessage" TEXT,
    "releaseTriggerCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleTerms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "artworkId" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "buyerName" TEXT,
    "buyerEmail" TEXT NOT NULL,
    "type" "PurchaseType" NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "instalmentCount" INTEGER,
    "releaseMessage" TEXT,
    "releaseTriggerCount" INTEGER,
    "stripeCustomerId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripeSubscriptionScheduleId" TEXT,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'DUE',
    "dueDate" TIMESTAMP(3),
    "paidDate" TIMESTAMP(3),
    "stripePaymentIntentId" TEXT,
    "stripeInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaleTerms_artworkId_key" ON "SaleTerms"("artworkId");

-- CreateIndex
CREATE INDEX "Purchase_artworkId_idx" ON "Purchase"("artworkId");

-- CreateIndex
CREATE INDEX "Payment_purchaseId_idx" ON "Payment"("purchaseId");

-- AddForeignKey
ALTER TABLE "SaleTerms" ADD CONSTRAINT "SaleTerms_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "Artwork"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "Artwork"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
