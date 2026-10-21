-- A deposit paid with a mail's payment button, noted in the Inbox once.
ALTER TABLE "InboundEmail" ADD COLUMN "stripePaymentIntentId" TEXT;
CREATE UNIQUE INDEX "InboundEmail_stripePaymentIntentId_key" ON "InboundEmail"("stripePaymentIntentId");
