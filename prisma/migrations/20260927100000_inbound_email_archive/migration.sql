-- Archiving received messages in the admin Inbox (2026-09-27).
-- Null = in the Inbox; set = archived. See InboundEmail.archivedAt.
ALTER TABLE "InboundEmail" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "InboundEmail_archivedAt_idx" ON "InboundEmail"("archivedAt");
