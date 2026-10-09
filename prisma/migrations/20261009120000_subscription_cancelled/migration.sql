-- Set when a client's subscription is cancelled (they have left).
ALTER TABLE "Artist" ADD COLUMN "subscriptionCancelledAt" TIMESTAMP(3);
