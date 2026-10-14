-- Invoice framing and delivery costs (2026-10-14): typed when an Own
-- location's invoice is produced, for the invoice as a whole, and paid
-- with it — so a payment can now belong to an invoice instead of a sale.
-- Per-sale payment links are gone (an invoice's link replaces them).

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "framingCost" DECIMAL(10,2),
ADD COLUMN "deliveryCost" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "purchaseId" DROP NOT NULL,
ADD COLUMN "invoiceId" TEXT;

-- Exactly one of a sale or an invoice.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_sale_or_invoice_check"
CHECK (("purchaseId" IS NULL) <> ("invoiceId" IS NULL));

-- AlterTable
ALTER TABLE "Purchase" DROP COLUMN "stripePaymentLinkId",
DROP COLUMN "stripePaymentLinkUrl",
DROP COLUMN "stripeInstalmentLinkId",
DROP COLUMN "stripeInstalmentLinkUrl",
DROP COLUMN "stripeInstalmentLinkCount";

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
