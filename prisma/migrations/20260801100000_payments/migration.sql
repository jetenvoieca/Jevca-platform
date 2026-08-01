-- CreateEnum
CREATE TYPE "PaymentPlanType" AS ENUM ('FULL', 'INSTALMENTS');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('DUE', 'PAID', 'FAILED');

-- AlterTable: Artist gains global Payments defaults
ALTER TABLE "Artist" ADD COLUMN "defaultInstalmentCount" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Artist" ADD COLUMN "defaultReleaseMessage" TEXT NOT NULL DEFAULT 'Available for collection/delivery once 2 payments have been made.';
ALTER TABLE "Artist" ADD COLUMN "defaultReleaseTriggerCount" INTEGER NOT NULL DEFAULT 2;

-- AlterTable: Site gains a default currency
ALTER TABLE "Site" ADD COLUMN "defaultCurrency" TEXT NOT NULL DEFAULT 'GBP';

-- CreateTable
CREATE TABLE "PaymentPlan" (
    "id" TEXT NOT NULL,
    "artworkId" TEXT NOT NULL,
    "type" "PaymentPlanType" NOT NULL DEFAULT 'FULL',
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "instalmentCount" INTEGER,
    "releaseMessage" TEXT,
    "releaseTriggerCount" INTEGER,
    "buyerName" TEXT,
    "buyerEmail" TEXT,
    "stripeCustomerId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripeSubscriptionScheduleId" TEXT,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
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
CREATE UNIQUE INDEX "PaymentPlan_artworkId_key" ON "PaymentPlan"("artworkId");

-- CreateIndex
CREATE INDEX "PaymentPlan_artworkId_idx" ON "PaymentPlan"("artworkId");

-- CreateIndex
CREATE INDEX "Payment_planId_idx" ON "Payment"("planId");

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "Artwork"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PaymentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
