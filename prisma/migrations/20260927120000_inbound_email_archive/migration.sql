-- Archiving inbound emails (2026-09-27) — see the archivedAt note on
-- the InboundEmail model in schema.prisma.
ALTER TABLE "InboundEmail" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "InboundEmail_archivedAt_receivedAt_idx" ON "InboundEmail"("archivedAt", "receivedAt");
