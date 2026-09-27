-- Archiving received messages in the admin Inbox (2026-09-27).
-- Null = in the Inbox; set = archived. See InboundEmail.archivedAt.
-- IF NOT EXISTS: the first attempt at this migration failed part-way
-- (overlapping deploys), so it must be safe to run again over whatever
-- that attempt left behind.
ALTER TABLE "InboundEmail" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "InboundEmail_archivedAt_idx" ON "InboundEmail"("archivedAt");
