-- Business mailbox (2026-09-27): the Inbox now holds two mailboxes —
-- ART (everything at jevca.art, as before) and BUSINESS (jetenvoieca.com).
-- Every existing message is ART.
CREATE TYPE "Mailbox" AS ENUM ('ART', 'BUSINESS');

ALTER TABLE "InboundEmail" ADD COLUMN "mailbox" "Mailbox" NOT NULL DEFAULT 'ART';
ALTER TABLE "OutboundEmail" ADD COLUMN "mailbox" "Mailbox" NOT NULL DEFAULT 'ART';

-- The address new Business messages are sent from.
ALTER TABLE "PlatformSettings" ADD COLUMN "businessEmailAddress" TEXT NOT NULL DEFAULT 'craig@jetenvoieca.com';

-- The Inbox list is always read per mailbox, Inbox or Archived, newest
-- first — this replaces the archivedAt-only index.
DROP INDEX IF EXISTS "InboundEmail_archivedAt_idx";
CREATE INDEX "InboundEmail_mailbox_archivedAt_receivedAt_idx" ON "InboundEmail"("mailbox", "archivedAt", "receivedAt");
CREATE INDEX "OutboundEmail_mailbox_sentAt_idx" ON "OutboundEmail"("mailbox", "sentAt");
