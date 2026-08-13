-- AlterTable
ALTER TABLE "Artist" ADD COLUMN "stripeSubscriptionCustomerId" TEXT;
ALTER TABLE "Artist" ADD COLUMN "stripeSubscriptionStatus" TEXT;

-- CreateTable
CREATE TABLE "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "stripeInvoiceId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Artist_stripeSubscriptionCustomerId_key" ON "Artist"("stripeSubscriptionCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPayment_stripeInvoiceId_key" ON "SubscriptionPayment"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_artistId_idx" ON "SubscriptionPayment"("artistId");

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
