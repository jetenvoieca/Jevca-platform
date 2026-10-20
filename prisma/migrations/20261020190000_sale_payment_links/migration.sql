-- Each consigned sale can have its own payment link again (gallery
-- invoices are paid work by work).
ALTER TABLE "Purchase" ADD COLUMN "stripePaymentLinkId" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "stripePaymentLinkUrl" TEXT;
