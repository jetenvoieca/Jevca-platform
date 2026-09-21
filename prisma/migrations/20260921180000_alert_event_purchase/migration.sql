-- Adds AlertEvent.purchaseId — the sale a sale alert (raised by the Studio
-- app) is about, so the Inbox can open that sale just as the Sales page
-- does. Additive only; set back to null if the sale is later deleted.
ALTER TABLE "AlertEvent" ADD COLUMN "purchaseId" TEXT;

CREATE INDEX "AlertEvent_purchaseId_idx" ON "AlertEvent"("purchaseId");

ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
