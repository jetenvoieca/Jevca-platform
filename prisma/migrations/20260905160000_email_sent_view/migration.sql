-- Unified Sent view (2026-09-05, Email Integration, second request) —
-- lets invoice/receipt/certificate sends show up in the same Sent list
-- as admin/reply sends, alongside the existing per-sale log fields on
-- Purchase (unchanged by this migration).

ALTER TABLE "OutboundEmail" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ADMIN';

-- Backfill: every existing row that's a reply to a specific inbound
-- message is a REPLY, not an ADMIN send — everything else so far
-- genuinely was an ADMIN send (Purchase-linked sends didn't exist before
-- this migration).
UPDATE "OutboundEmail" SET "kind" = 'REPLY' WHERE "inReplyToId" IS NOT NULL;

ALTER TABLE "OutboundEmail" ADD COLUMN "purchaseId" TEXT;
CREATE INDEX "OutboundEmail_purchaseId_idx" ON "OutboundEmail"("purchaseId");
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
