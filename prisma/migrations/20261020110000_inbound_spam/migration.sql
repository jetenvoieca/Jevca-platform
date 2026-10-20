-- Spam filtering of received emails: when filed as spam, and why.
ALTER TABLE "InboundEmail" ADD COLUMN "spamAt" TIMESTAMP(3);
ALTER TABLE "InboundEmail" ADD COLUMN "spamReason" TEXT;
CREATE INDEX "InboundEmail_spamAt_idx" ON "InboundEmail"("spamAt");

-- Senders the spam filter never applies to (added by Not spam).
CREATE TABLE "TrustedSender" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustedSender_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrustedSender_address_key" ON "TrustedSender"("address");
